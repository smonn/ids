# Project guidance

## Delegation

- Delegate any work that doesn't require Opus-level (or higher) capability to a cheaper subagent via the Agent tool with an explicit `model` override: `haiku` for mechanical, low-judgment work (broad searches, file/usage sweeps, log or test-output digestion, boilerplate transforms), `sonnet` for routine implementation and summarization. Reserve the main-loop model for what actually needs it: design decisions, tricky debugging, review verdicts, and final synthesis of delegated results.
- When delegating, give the subagent a self-contained brief (exact paths, the question to answer, the expected output shape) and treat its report as the deliverable — don't redo its reads in the main context.

## Response style

- Don't narrate intent with preambles like "let me do X", "now I'll X", or "I'm going to X". Just do the thing, or describe it directly ("Doing X", "Checking Y").
- No filler transitions ("Great", "Now", "Let me") before tool calls.
