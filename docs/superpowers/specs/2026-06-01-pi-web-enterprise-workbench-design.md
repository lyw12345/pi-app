# pi-web Enterprise Workbench Design

Date: 2026-06-01
Project: `pi-web`
Status: Proposed

## Summary

`pi-web` should evolve from a developer-oriented session UI into a scene-driven AI workbench for enterprise non-developers.

The recommended first release is not a full enterprise platform, not a developer IDE, and not a pure chat app. It is a chat-heavy business workbench where users start from business scenes, then complete work inside a constrained chat experience.

The product should:

- keep the existing `pi-web` session and streaming runtime as the execution core
- add a product-layer `Scene` abstraction above sessions
- add control-plane APIs for scenes, usage, automation, and sources
- keep chat as the main interaction mode inside each scene
- expose productized business entry points instead of raw models, tools, or sessions

## Goals

- Make `pi-web` usable by enterprise non-developers
- Organize entry points around business tasks, not technical primitives
- Preserve the low-friction chat interaction that already works well
- Create a product structure that can later grow into a broader enterprise AI platform

## Non-Goals

- Rebuild `pi-web` as a full enterprise admin system in the first release
- Reproduce all of `ClawX` or `claude-code`
- Lead with developer-only capabilities such as LSP, bridge, worktree, or multi-agent swarms
- Build a full multi-channel operations platform in the first release
- Introduce a heavy low-code or workflow-builder experience up front

## Product Positioning

`pi-web` should be positioned as a scene-driven AI workbench for enterprise non-developers.

The first release should feel like:

- a business-facing AI workbench
- chat-enhanced
- scene-oriented
- easy to understand within the first minute of use

It should not feel like:

- a raw coding-agent shell
- a model playground
- a settings-heavy admin console

## User Direction

Primary user:

- enterprise non-developers

Likely early users:

- operations teams
- sales and customer-facing teams
- internal knowledge workers
- product or business operations staff

First-release usage mode:

- a unified interface, without a strong administrator/user split

The architecture must still support a future split between:

- business-user consumption views
- admin or operator configuration views

## Core Product Strategy

### Entry Strategy

The homepage should use scene cards as the primary entry point.

Users should begin by choosing a business task such as:

- enterprise knowledge assistant
- report generation
- customer communication
- process execution

There may still be a lightweight global chat entry, but it should not dominate the homepage.

### Interaction Strategy

Inside each scene, chat remains the primary interaction mode.

This aligns with the chosen direction of keeping chat heavier in the first release, because it:

- preserves current `pi-web` strengths
- lowers the learning curve for non-developers
- allows scenes to evolve gradually without building separate mini-apps for each use case

### Product Principle

The homepage should expose `Scene`, not `Session`.

`Session` remains a runtime object underneath, but users should understand the product through business scenes.

## Information Architecture

The recommended first-release structure is:

1. Home / Scene Portal
2. Scene Page / Work Page
3. History / My Work
4. Platform Settings

### 1. Home / Scene Portal

Purpose:

- show what the product can do
- help users choose the right scene quickly

Primary content:

- scene cards
- recent scenes
- pending results or recent work

### 2. Scene Page / Work Page

Purpose:

- let a user complete a business task

Primary content:

- scene name and explanation
- suggested prompts or quick starters
- chat stream
- structured next actions
- recent outputs or related history

### 3. History / My Work

Purpose:

- help users find previous work without exposing raw internal session complexity

Primary content:

- past scene runs
- summaries
- status
- last updated time

### 4. Platform Settings

Purpose:

- hold product-layer configuration without competing with the main user flow

Primary content in the early phase:

- models
- skills
- basic sources
- later: automation and scene configuration

## Scene Model

The first release should introduce a product-layer `Scene` abstraction.

A `Scene` is not a standalone app. It is a constrained business-facing chat entry that defines:

- what problem it solves
- what context it may use
- how it should respond
- what actions the user may take next

Minimum recommended fields:

- `id`
- `name`
- `description`
- `category`
- `entryMode`
- `defaultPrompt`
- `sourceIds`
- `actionIds`
- `outputStyle`
- `suggestedStarters`
- `status`

## Core Data Objects

To keep product structure separate from runtime structure, the system should define four top-level product objects.

### Scene

Represents a business capability entry point.

Responsibility:

- product expression
- user-facing meaning
- business scope

### Session

Represents one actual run or conversation instance.

It can still map to existing `pi-web` / `pi` session mechanics, but at the product layer it should carry business context such as:

- `sceneId`
- `title`
- `userId`
- `status`
- `lastResultSummary`
- `startedAt`
- `updatedAt`

### Action

Represents user-understandable business actions, not raw tools.

Examples:

- export report
- draft customer reply
- submit for next step

Suggested fields:

- `id`
- `name`
- `type`
- `label`
- `description`
- `requiresInput`
- `outputTarget`
- `enabled`

### Source

Represents context boundaries and data sources available to a scene.

Sources should remain distinct from prompts so the system can later evolve toward a proper source-management layer.

Suggested fields:

- `id`
- `name`
- `type`
- `pathOrRef`
- `scope`
- `description`
- `enabled`

## Object Relationships

Recommended relationship model:

- a `Scene` binds a set of `Source` objects
- a `Scene` exposes a set of `Action` objects
- entering a `Scene` creates or continues a `Session`
- a `Session` can trigger one or more `Action` objects
- the final response and behavior of a `Session` are constrained by `Scene + Source`

This separation gives future flexibility for:

- permissions
- analytics
- admin tooling
- source governance

## First-Release Capability Package

The first release should stay focused and complete.

Recommended initial scenes:

1. Enterprise Knowledge Assistant
2. Report Generation Assistant
3. Customer Communication Assistant
4. Process Execution Assistant

These four scenes cover:

- knowledge work
- content generation
- communication support
- structured task execution

## First-Release Scope

### P0

Must-have:

- scene homepage
- scene work page
- four initial scenes
- lightweight scene configuration model
- history / my work
- retained basic platform settings for models and skills

### P1

Should follow soon after:

- usage and cost visibility
- manual plus basic scheduled automation
- templated scene inputs
- result export
- scene configuration page

### P2

Later:

- role and permission split
- audit and execution logs
- richer source center
- channel integrations
- admin/business UI separation

## First-Release User Flows

### Flow 1: Knowledge Q&A

- user lands on home
- user selects enterprise knowledge assistant
- user asks in chat
- system responds with answer, source references, and next actions
- user copies, exports, or continues the conversation

### Flow 2: Report Generation

- user lands on home
- user selects report generation assistant
- user provides request and optional materials
- system returns structured output
- user refines, exports, or reuses the result

### Flow 3: Customer Communication

- user selects customer communication assistant
- user pastes context or message
- system returns draft reply and tone/risk guidance
- user edits and exports

### Flow 4: Process Execution

- user selects process execution assistant
- user starts from a template or describes the task in chat
- system runs a structured task
- user reviews the result and follows next-step actions

## System Architecture Direction

### Keep

Keep the current `pi-web` runtime strengths as the execution core:

- sessions
- streaming
- model switching
- skill fundamentals

### Add

Add a product-layer `Scene` orchestration layer above the existing runtime.

Add new control-plane APIs alongside existing session APIs.

Current API families already fit the execution layer:

- `sessions`
- `agent`
- `models`
- `skills`

Recommended new families:

- `scenes`
- `usage`
- `automation`
- `sources`

### Frontend Split

Split the frontend conceptually into:

- user workbench layer
- platform capability layer

The user workbench layer includes:

- home
- scenes
- history

The platform capability layer includes:

- models
- skills
- sources
- later: automation and admin controls

### Backend State Split

Separate backend state into:

- session state
- scene configuration state
- derived aggregate state

This keeps analytics and business-product features from being forced into raw session structures.

## What to Borrow From Other Products

### Borrow From ClawX

Borrow product-layer expression, not desktop-host assumptions.

Best sources of inspiration:

- skills marketplace and configuration
- provider center
- usage and cost visualization
- automation / cron presentation
- configuration-vs-usage page separation

### Do Not Borrow From ClawX Yet

- gateway lifecycle management as a core product feature
- tray, updater, system startup, and other desktop host features
- full channel integration platform
- desktop-oriented plugin and host orchestration complexity

### Delay Borrowing From claude-code

Delay developer-heavy capability families such as:

- LSP
- bridge
- worktree
- deep multi-agent orchestration
- developer-facing persistent memory workflows

These can become future internal capability upgrades, but should not define the first product release for enterprise non-developers.

## Risks

### Risk 1: Staying Session-Centric

If the product continues to organize itself primarily around sessions, non-developers will not understand it as a business tool.

Mitigation:

- keep `Scene` as the primary product object
- keep `Session` internal to runtime and history

### Risk 2: Growing Into a Full Enterprise Platform Too Early

Too-early expansion into permissions, org structures, channels, and complex admin tooling will explode scope.

Mitigation:

- release a focused scene-driven workbench first

### Risk 3: Copying ClawX Host Complexity

Desktop-host infrastructure does not directly translate into the best Web product decisions.

Mitigation:

- copy product expression only
- rebuild implementation for Web control-plane needs

### Risk 4: Chat Overwhelms Scene Definition

If a scene becomes just a renamed general chat box, the product loses business clarity.

Mitigation:

- every scene must have explicit purpose, boundaries, starters, output style, and actions

### Risk 5: Scene Configuration Becomes Too Heavy

If scenes require heavy configuration to launch, the platform becomes difficult to maintain.

Mitigation:

- keep scene configuration lightweight in the first release

## Explicit Boundaries

The first release is:

- an enterprise-facing scene-driven AI workbench
- chat-heavy
- task-oriented

The first release is not:

- a developer IDE
- a full enterprise admin platform
- a full multi-channel operations product

## Recommended Delivery Sequence

### Phase 1

- define `Scene`
- build home portal
- build scene page shell
- ship two high-frequency scenes

### Phase 2

- expand to four first-release scenes
- add history and result export
- improve scene reuse and business framing

### Phase 3

- add usage visibility
- add automation entry points
- add lightweight scene configuration

### Phase 4

- evaluate permissions
- evaluate richer source management
- evaluate channels and broader platform expansion based on real usage

## Recommendation

The recommended product path is:

1. keep the current `pi-web` session runtime as the core
2. add a `Scene` abstraction as the primary business-facing object
3. turn the product into a scene-driven, chat-heavy workbench for enterprise non-developers
4. borrow product-layer patterns from `ClawX`
5. delay deeper `claude-code`-style developer capabilities until later

In one sentence:

Build `pi-web` first as a scene-driven chat workbench, then grow it into an enterprise AI platform.
