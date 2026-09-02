# ADR-0003: A disputed statement is a flag, not a lifecycle state

**Status:** accepted (2026-09-02), applies from M5

## Context

Spec 17 STMT-5 defines `draft → approved → sent → paid`; spec 03 §3.8 adds `disputed` to `OwnerStatement.state`.
A sent statement is immutable (INV-13), so a state transition after `sent` would contradict the lifecycle.

## Decision

`OwnerStatement.state` keeps the four-step chain. Disputes are `dispute_state: none | open | resolved` plus
`dispute_thread_id`. A disputed statement stays `sent` or `paid`; the resolution lands as an adjustment line on
the next statement (STMT-4, OWN-2).

## Consequences

Immutability holds; the owner portal's dispute button opens a thread, and reports can count open disputes without
special-casing a state.
