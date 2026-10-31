---
status: implemented
date: 2026-10-30
description: Read before changing how lib/client.js picks its UI language, adds labels, or registers sidebar metadata.
raised-by: agent
decided-by: agent
created: 2026-10-30
commit: 0a5ca5e
paths: [lib/client.js, test/client-locale.test.mjs, test/ui-lang.cjs]
---

# ADR: 8 Take the client UI language from the host locale service

## Problem

The board picked its language once, when the browser bundle was evaluated, from `document.documentElement.lang`. The Host serves that attribute as a static `en` and only rewrites it after its locale plugin has resolved the active language. On desktop that resolution is an asynchronous native read. A cold start could therefore evaluate the bundle first and freeze the whole board in English while the rest of the application was Chinese, and a later language change never reached the panel at all because the value had been captured into a module constant.

The reported symptom was a board whose sidebar entry said `Agents` and whose panel said `Agent Team` while the surrounding UI was Chinese, appearing only on some launches.

## Decision

The browser bundle declares `locale` among its injected services and reads the active language from `ctx.locale.getSnapshot()`, subscribing through `ctx.locale.subscribe` so an open panel re-renders when the language changes. `L()` remains the single label helper, every label is computed at render time, and `useChinese()` subscribes a component to the shared language value.

Injection also orders activation: the plugin now applies only after the locale service exists, so the language is known before the first registration and no label is ever built from the pre-resolution document state.

The sidebar entry's label is static registration metadata rather than rendered content, so `apply()` registers the entry again when the language changes; the panel body needs no such step.

`document.documentElement.lang` survives only as the pre-apply fallback for a host that renders the bundle outside the plugin lifecycle. Render paths must not read it, and `navigator.language` must not decide the language: it describes the machine, not the chosen UI language.

## Alternatives considered

**Read `<html lang>` at render time and follow it with a MutationObserver.** Works while the Host keeps syncing the attribute, but keeps a document attribute as the language authority, and that attribute is exactly the value that was stale when the bug was reported.

**`navigator.language` only.** Stable and simple, but wrong whenever the chosen UI language differs from the system language, which is a supported configuration.

**Always bilingual labels ("协作台 / Agents").** Removes the alternation, but doubles every label on screen and abandons the repo's `L()` convention.

**Register dictionaries with the Host locale runtime and render through `t()`.** The idiomatic DSH path for many languages, but this board ships two languages and no namespace typing; a dictionary layer would add machinery without changing behavior.

## Consequences

A cold start shows the chosen language the first time, and an open panel follows a language switch without a page refresh. The plugin now requires the `locale` client service: on a host that never provides it the plugin does not activate. That is deliberate. Without the service there is no authority for the language, and guessing is what produced the bug.

Regression coverage lives in `test/client-locale.test.mjs`, which drives the real bundle against a fake host with a stale `en` document and a `zh` locale and asserts both label re-registration and render-time labels, and in `test/ui-lang.cjs`, which reproduces a cold desktop start with a delayed native bridge against the running host.

The sidebar entry is disposed and registered again on each language change; the registry never mutates a label in place, so this record also documents why the entry is re-registered rather than edited.
