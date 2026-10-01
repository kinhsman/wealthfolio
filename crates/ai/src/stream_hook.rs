//! Stream-level guard rails for the agentic loop.
//!
//! Implements rig's `AgentHook` to prevent three failure modes we see
//! with small open-source models (qwen, ministral, etc.):
//!
//! 1. **Tool-call storms** — the model re-emits the same tool call dozens of
//!    times per turn. Detected via a per-`(tool, args)` counter in
//!    [`WealthfolioStreamHook::on_tool_call`]. Repeated calls are short-circuited
//!    with `ToolCallAction::Skip(reason)` — which rig feeds back to the
//!    model as the tool result, so the model sees the cached data it already
//!    received and a nudge to stop re-calling.
//!
//! 2. **Global runaway** — total tool calls across a turn can still blow up even
//!    with dedup. Hard cap via `ToolCallAction::Stop` when over
//!    [`MAX_TOTAL_TOOL_CALLS`].
//!
//! 3. **Token-level repetition loops** — the model streams
//!    `"get_performance, get_performance, ..."` indefinitely without ever
//!    emitting a well-formed tool call (qwen thinking mode). Detected in
//!    [`WealthfolioStreamHook::on_text_delta`] by looking for a short suffix
//!    that already appears many times in the trailing buffer, or by the
//!    stream exceeding [`MAX_STREAM_CHARS`].
//!
//! 4. **Running out of turns** (money-hub) — rig ends a run that is still
//!    calling tools after its last turn with `MaxTurnsError`, throwing away
//!    everything the tools found. [`WealthfolioStreamHook::with_final_turn`]
//!    takes the tools away from the last turn and tells the model to answer
//!    from what it already has. Some models (Gemini behind 9Router) call a
//!    tool anyway; that call is sent back with [`FINAL_TURN_RETRY_NOTE`], up
//!    to [`FINAL_TURN_RETRIES`] times, instead of failing the run.
//!
//! The hook is cheaply cloneable because state is behind
//! an `Arc<Mutex<_>>`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use log::{debug, warn};
use rig::agent::hook::{
    AgentHook, CompletionCall, CompletionCallAction, HookContext, InvalidToolCallAction,
    InvalidToolCallContext, ObservationAction, RequestPatch, TextDelta, ToolCall, ToolCallAction,
    ToolResultAction, ToolResultEvent,
};
use rig::message::ToolChoice;

/// Maximum distinct identical `(tool_name, args_json)` calls we'll execute.
/// Beyond this count the hook returns a "stop calling this" skip. Two is
/// enough: first call executes, second re-request serves as a tolerance for
/// benign retries, third and beyond get the nudge.
const MAX_DUPLICATE_CALLS: usize = 2;
const ASSET_SELECTION_PAUSE: &str = "Waiting for asset selection";

/// Absolute cap on tool calls across one streamed turn. Calibrated against
/// LibreChat's `recursionLimit` (default 25) — we're slightly tighter because
/// this is a desktop UX, not a server agent.
const MAX_TOTAL_TOOL_CALLS: usize = 20;

/// Model calls in one chat run (money-hub: was 7). The last one may not call
/// tools, see [`WealthfolioStreamHook::with_final_turn`].
pub const MAX_TURNS: usize = 10;

/// Extra model calls when the last turn calls a tool anyway. Give the runner
/// `max_turns(MAX_TURNS + FINAL_TURN_RETRIES)` and
/// `max_invalid_tool_call_retries(FINAL_TURN_RETRIES)`.
pub const FINAL_TURN_RETRIES: usize = 2;

/// Sent back as the result of a tool the model called after its last lookup.
pub const FINAL_TURN_RETRY_NOTE: &str = "Not run: there are no more lookups. Do not call any tool. \
Write your answer to the user now as text, from the results above, and say what you could not check.";

/// Added to the system prompt on the last turn, when tools are switched off.
pub const FINAL_TURN_NOTE: &str = "FINAL TURN: you cannot call any more tools. \
Answer the user's latest question now, using only the tool results already in this conversation. \
If they are incomplete, give what you found (amounts, dates, totals) and say plainly what you could not find.";

/// Maximum streamed text+reasoning characters before we assume runaway
/// generation and terminate. Jan's default `max_tokens` is 2048 (~8000 chars);
/// we allow significantly more so legitimate long answers pass through.
const MAX_STREAM_CHARS: usize = 80_000;

/// Trailing window inspected for repetition at the end of the stream.
const REPETITION_TAIL_WINDOW: usize = 1024;

/// Length of the suffix used as the repetition probe.
const REPETITION_PROBE_LEN: usize = 24;

/// How many times the probe must appear in the tail to count as a loop.
const REPETITION_MIN_REPEATS: usize = 8;

#[derive(Default)]
struct HookState {
    /// Per `(tool_name, args_json)` call counter.
    tool_call_counts: HashMap<String, usize>,
    /// Previously executed tool results, keyed the same way. Populated by
    /// `on_tool_result` so that a `Skip` response can feed the real data back
    /// to the model instead of a bare error.
    tool_result_cache: HashMap<String, String>,
    /// Total tool calls seen this stream.
    total_tool_calls: usize,
    pause_for_asset_selection: bool,
}

#[derive(Default, Clone)]
pub struct WealthfolioStreamHook {
    state: Arc<Mutex<HookState>>,
    omit_reasoning_history: bool,
    /// Last turn of the run and the system prompt to extend on it.
    final_turn: Option<(usize, Arc<str>)>,
}

impl WealthfolioStreamHook {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn for_provider(provider_id: &str) -> Self {
        Self {
            omit_reasoning_history: provider_id == "groq",
            ..Self::default()
        }
    }

    /// From turn `max_turns` on, send no tools, `tool_choice: none` and the
    /// system prompt plus [`FINAL_TURN_NOTE`], so the model answers. A tool it
    /// calls anyway is retried with [`FINAL_TURN_RETRY_NOTE`] (see
    /// [`FINAL_TURN_RETRIES`] for the runner settings this needs).
    pub fn with_final_turn(mut self, max_turns: usize, preamble: &str) -> Self {
        self.final_turn = Some((max_turns, Arc::from(preamble)));
        self
    }

    pub fn paused_for_asset_selection(&self) -> bool {
        self.state
            .lock()
            .map(|state| state.pause_for_asset_selection)
            .unwrap_or(false)
    }

    pub fn is_asset_selection_pause(&self, error: &rig::agent::StreamingError) -> bool {
        self.paused_for_asset_selection()
            && matches!(error, rig::agent::StreamingError::Prompt(error)
                if matches!(error.as_ref(), rig::completion::PromptError::PromptCancelled { reason, .. } if reason == ASSET_SELECTION_PAUSE))
    }

    fn key(tool_name: &str, args: &str) -> String {
        // The activity search ignores case, so "STICKER" and "sticker" are the
        // same call.
        if tool_name == "search_activities" {
            format!("{}::{}", tool_name, args.to_lowercase())
        } else {
            format!("{}::{}", tool_name, args)
        }
    }
}

impl AgentHook for WealthfolioStreamHook {
    async fn on_completion_call(
        &self,
        ctx: &HookContext,
        event: CompletionCall<'_>,
    ) -> CompletionCallAction {
        if self.paused_for_asset_selection() {
            return CompletionCallAction::Stop(ASSET_SELECTION_PAUSE.into());
        }
        let mut patch = RequestPatch::default();
        let mut patched = false;
        if self.omit_reasoning_history {
            // Groq rejects reasoning_content on assistant input messages. Keep
            // streamed reasoning in the UI, but omit it from provider requests.
            let mut history = event.history.to_vec();
            for message in &mut history {
                if let rig::completion::Message::Assistant { content, .. } = message {
                    content.retain(|part| {
                        !matches!(part, rig::message::AssistantContent::Reasoning(_))
                    });
                }
            }
            history.retain(|message| !matches!(message, rig::completion::Message::Assistant { content, .. } if content.is_empty()));
            patch.history = Some(history);
            patched = true;
        }
        if let Some((max_turns, preamble)) = &self.final_turn {
            if ctx.turn() >= *max_turns {
                debug!("Final turn {} of {}: tools off", ctx.turn(), max_turns);
                // No tool list at all: 9Router's Gemini ignores tool_choice
                // "none" while tools are listed.
                patch.active_tools = Some(Vec::new());
                patch.tool_choice = Some(ToolChoice::None);
                patch.preamble = Some(format!("{preamble}\n\n{FINAL_TURN_NOTE}"));
                patched = true;
            }
        }
        if patched {
            CompletionCallAction::Patch(patch)
        } else {
            CompletionCallAction::Continue
        }
    }

    async fn on_invalid_tool_call(
        &self,
        ctx: &HookContext,
        event: &InvalidToolCallContext,
    ) -> Option<InvalidToolCallAction> {
        let (max_turns, _) = self.final_turn.as_ref()?;
        if ctx.turn() < *max_turns {
            return None; // an unknown tool earlier still fails the run
        }
        warn!(
            "Tool `{}` called on final turn {}: asking for the answer again",
            event.tool_name,
            ctx.turn()
        );
        Some(InvalidToolCallAction::retry(FINAL_TURN_RETRY_NOTE))
    }

    fn on_tool_call(
        &self,
        _ctx: &HookContext,
        event: ToolCall<'_>,
    ) -> impl std::future::Future<Output = ToolCallAction> + Send {
        let tool_name = event.tool_name;
        let args = event.args;
        let state = self.state.clone();
        let tool_name = tool_name.to_string();
        let args = args.to_string();
        async move {
            let key = Self::key(&tool_name, &args);
            let Ok(mut state) = state.lock() else {
                return ToolCallAction::Run;
            };

            state.total_tool_calls += 1;
            if state.total_tool_calls > MAX_TOTAL_TOOL_CALLS {
                warn!(
                    "Tool-call cap tripped: {} total calls this turn — terminating",
                    state.total_tool_calls
                );
                return ToolCallAction::stop(
                    "The model exceeded the tool-call limit for a single turn. \
                     Ending the run; ask the user to rephrase or switch to a more capable model.",
                );
            }

            let count = state.tool_call_counts.entry(key.clone()).or_insert(0);
            *count += 1;
            let hits = *count;

            if hits > MAX_DUPLICATE_CALLS {
                warn!(
                    "Duplicate tool-call guard tripped: {}({}) called {} times",
                    tool_name, args, hits
                );
                let reason = match state.tool_result_cache.get(&key) {
                    Some(cached) => format!(
                        "You have already called `{tool_name}` with these arguments {hits} times \
                         and received this result:\n\n{cached}\n\n\
                         Stop calling this tool. Write the final answer to the user using the data above.",
                    ),
                    None => format!(
                        "You have already called `{tool_name}` with these arguments {hits} times. \
                         Stop calling this tool. Write the final answer to the user using the data \
                         you already have in the conversation."
                    ),
                };
                return ToolCallAction::skip(reason);
            }

            debug!(
                "Tool call allowed: {}({}) [hit {}/{}]",
                tool_name, args, hits, MAX_DUPLICATE_CALLS
            );
            ToolCallAction::Run
        }
    }

    fn on_tool_result(
        &self,
        _ctx: &HookContext,
        event: ToolResultEvent<'_>,
    ) -> impl std::future::Future<Output = ToolResultAction> + Send {
        let state = self.state.clone();
        let key = Self::key(event.tool_name, event.args);
        let result = (!event.raw_result.is_skipped()).then(|| event.presentation.render());
        let pause = event.tool_name == "prepare_asset_classification"
            && result
                .as_deref()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
                .is_some_and(|data| {
                    data.get("draftStatus").and_then(serde_json::Value::as_str)
                        == Some("needsAssetSelection")
                });
        async move {
            if let Some(result) = result {
                if let Ok(mut state) = state.lock() {
                    state.tool_result_cache.insert(key, result);
                    state.pause_for_asset_selection |= pause;
                }
            }
            ToolResultAction::Keep
        }
    }

    fn on_text_delta(
        &self,
        _ctx: &HookContext,
        event: TextDelta<'_>,
    ) -> impl std::future::Future<Output = ObservationAction> + Send {
        let aggregated_text = event.aggregated;
        let is_repetitive = is_repetitive(aggregated_text);
        let total = aggregated_text.chars().count();
        async move {
            if total > MAX_STREAM_CHARS {
                warn!(
                    "Stream length cap tripped ({} > {} chars) — terminating",
                    total, MAX_STREAM_CHARS
                );
                return ObservationAction::stop(
                    "The model produced more text than allowed for a single turn. \
                     Ending the run; it was likely stuck.",
                );
            }
            if is_repetitive {
                warn!("Repetition guard tripped on streamed text — terminating");
                return ObservationAction::stop(
                    "The model got stuck repeating itself. \
                     Ending the run; try rephrasing the question or switching to a more capable model.",
                );
            }
            ObservationAction::Continue
        }
    }
}

/// Detects repetition at the tail of the aggregated text: look at the last
/// `REPETITION_PROBE_LEN` chars and count how many times that suffix appears
/// in the last `REPETITION_TAIL_WINDOW` chars of the stream. We only check
/// once the tail is long enough to be meaningful, and skip if the probe is
/// all whitespace (legitimate trailing newlines shouldn't trip the guard).
fn is_repetitive(aggregated_text: &str) -> bool {
    let total_bytes = aggregated_text.len();
    if total_bytes < REPETITION_PROBE_LEN * REPETITION_MIN_REPEATS {
        return false;
    }

    // Slice the trailing window on char boundaries.
    let tail_byte_start = aggregated_text
        .char_indices()
        .rev()
        .take(REPETITION_TAIL_WINDOW)
        .last()
        .map(|(i, _)| i)
        .unwrap_or(0);
    let tail = &aggregated_text[tail_byte_start..];

    if tail.len() < REPETITION_PROBE_LEN * REPETITION_MIN_REPEATS {
        return false;
    }

    // Probe = last REPETITION_PROBE_LEN chars of the tail.
    let probe_byte_start = tail
        .char_indices()
        .rev()
        .take(REPETITION_PROBE_LEN)
        .last()
        .map(|(i, _)| i)
        .unwrap_or(0);
    let probe = &tail[probe_byte_start..];
    if probe.trim().is_empty() {
        return false;
    }

    if tail.matches(probe).count() < REPETITION_MIN_REPEATS {
        return false;
    }

    // money-hub: a stuck model repeats the same chunk back to back. A table
    // whose rows end alike ("| No transaction found | — |" for 13 years) also
    // repeats the probe, but its rows differ (the year), so it is not
    // periodic. Require the last REPETITION_MIN_REPEATS periods to be equal.
    // Bytes, not str slices: a slice that cuts a multi-byte character (the
    // table's dashes) would panic.
    let bytes = tail.as_bytes();
    let probe = probe.as_bytes();
    let probe_start = bytes.len() - probe.len();
    let Some(previous) = (0..probe_start)
        .rev()
        .find(|&i| &bytes[i..i + probe.len()] == probe)
    else {
        return false;
    };
    let period = probe_start - previous;
    let span = period * REPETITION_MIN_REPEATS;
    if period == 0 || span > bytes.len() {
        return false;
    }
    let start = bytes.len() - span;
    bytes[start..bytes.len() - period] == bytes[start + period..]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_repetitive_text_passes() {
        let text = "This is a normal response about your portfolio. \
                    It includes several different sentences with distinct content. \
                    Market values, cost basis, and performance metrics are discussed.";
        assert!(!is_repetitive(text));
    }

    #[test]
    fn short_text_passes() {
        assert!(!is_repetitive("short"));
    }

    #[test]
    fn detects_qwen_style_tool_repetition() {
        let mut buf = String::from("Let me check the tools available: ");
        for _ in 0..30 {
            buf.push_str("get_performance, ");
        }
        assert!(is_repetitive(&buf));
    }

    #[test]
    fn detects_word_level_repetition() {
        let mut buf = String::from("The user asked about performance. ");
        for _ in 0..50 {
            buf.push_str("the same answer ");
        }
        assert!(is_repetitive(&buf));
    }

    #[test]
    fn table_rows_that_end_alike_pass() {
        let mut buf = String::from("| Year | Date | Amount |\n| :--- | :--- | :--- |\n");
        for year in 2014..2027 {
            buf.push_str(&format!(
                "| **{year}** | — | *No transaction found* | — | — |\n"
            ));
        }
        // Checked at every point while it streams, like on_text_delta does.
        for end in (1..=buf.len()).filter(|i| buf.is_char_boundary(*i)) {
            assert!(!is_repetitive(&buf[..end]), "tripped at {end}");
        }
    }

    #[test]
    fn long_diverse_text_passes() {
        let mut buf = String::new();
        for i in 0..200 {
            buf.push_str(&format!("Sentence number {} with unique content. ", i));
        }
        assert!(!is_repetitive(&buf));
    }
}
