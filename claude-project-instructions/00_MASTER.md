# 00 — MASTER INSTRUCTION FILE
## Claude-Project Agent Upgrade Mission

> **READ THIS FILE FIRST. Every session starts here.**
> This is the single entry point for all upgrade work on `claude-project`.

---

## What This Mission Is

You are upgrading `claude-project` — a Claude Code project-brain tool — from a
human-readable, Obsidian-centric system into a **fully agent-optimized, research-grade
multi-agent orchestration infrastructure**. The upgrade is grounded in published research
on token-efficient agent communication, content-addressed state, and protocol negotiation.

The upgrade also positions this project as **original research** — you will instrument
it to be the first system to empirically measure PD-negotiation break-even points and
operate a content-addressed Protocol Document registry. Two open problems in the current
literature will be answered by this project.

---

## Context Budget Strategy

**You will run out of context. This is expected and planned for.**

Before any context compaction occurs, you MUST:
1. Write your current checkpoint to `AGENT_STATE.md` (template in this repo)
2. Complete the current atomic task fully before starting the next
3. Run verification commands and record results in `AGENT_STATE.md`
4. Never split a single file modification across two sessions

**On every session start:**
1. Read `AGENT_STATE.md` first — it tells you exactly where you are
2. Read only the instruction file for the current phase
3. Do not re-read completed phases unless `AGENT_STATE.md` flags a regression

---

## Instruction Files Index

| File | Phase | Prerequisite |
|------|-------|--------------|
| `00_MASTER.md` | Entry point | — |
| `01_RESEARCH_DOWNLOAD.md` | Download all papers, libraries, repos | None |
| `02_CODEBASE_AUDIT.md` | Reference audit of current state | Phase 1 done |
| `03_TARGET_ARCHITECTURE.md` | Full target system design | Phase 1 done |
| `04_PHASE1_MEASUREMENT.md` | Research instrumentation layer | Phase 1 done |
| `05_PHASE2_DATABASE.md` | Replace Obsidian with SQLite+LanceDB+Kuzu | Phase 4 done |
| `06_PHASE3_PD_REGISTRY.md` | Protocol Document registry | Phase 5 done |
| `07_PHASE4_TYPED_DISPATCH.md` | Typed dispatch + task routing | Phase 6 done |
| `08_PHASE5_COMPRESSION.md` | LLMLingua + Clarity Layer + caching | Phase 7 done |
| `09_TESTING_STRATEGY.md` | Full test plan, verification, rollback | Reference throughout |
| `AGENT_STATE.md` | Your live progress tracker | Write every session |

---

## Execution Order

Phase 0: Read AGENT_STATE.md → determine current position
Phase 1: 01_RESEARCH_DOWNLOAD.md → download all assets
Phase 2: 02_CODEBASE_AUDIT.md → read only, no changes
Phase 3: 03_TARGET_ARCHITECTURE.md → read only, form implementation plan
Phase 4: 04_PHASE1_MEASUREMENT.md → implement + test + checkpoint
Phase 5: 05_PHASE2_DATABASE.md → implement + test + checkpoint
Phase 6: 06_PHASE3_PD_REGISTRY.md → implement + test + checkpoint
Phase 7: 07_PHASE4_TYPED_DISPATCH.md → implement + test + checkpoint
Phase 8: 08_PHASE5_COMPRESSION.md → implement + test + checkpoint
Phase 9: 09_TESTING_STRATEGY.md → full integration test


**Never skip a phase. Never start a phase without completing the previous one.**

---

## Key Constraint: Agent-Only Optimization

Every decision must be evaluated against this rule:

> **Does this exist for human readability/comfort? If yes, it does not belong
> in the agent data layer.**

Human-facing features (VS Code extension, Obsidian sync, WAKEUP.md, CLAUDE.md generation)
are kept but strictly isolated from the agent data layer. They become read-only exports,
never the source of truth.

---

## Research Context

All design decisions in these files are grounded in published research.
The research report `llm-multi-agent-protocols-report.md` is provided alongside
these instruction files. Key papers to download are listed in `01_RESEARCH_DOWNLOAD.md`.

The two primary open research problems this project will answer:

**Problem 1:** At what interaction frequency (N) does one-time PD negotiation break even
versus continuing in natural language? Formula: N_breakeven = C_negotiate / (C_NL - C_PD)

**Problem 2:** Can a content-addressed PD registry scale across projects and agents,
and does cross-session PD reuse reduce token cost measurably?

---

## Communication With Damian

If you are blocked, need a decision, or encounter an ambiguity not covered in the
instruction files, write a `BLOCKED.md` file with:
- Current phase and task
- The specific question
- Two or three options with trade-offs

Do not guess. Do not proceed past a block.

---

## Version

Instruction set version: 1.0.0
Created: 2026-03-26
Project repo: https://github.com/infraax/claude-project