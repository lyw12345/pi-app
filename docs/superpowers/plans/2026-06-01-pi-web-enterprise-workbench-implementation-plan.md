# pi-web Enterprise Workbench Implementation Plan

Date: 2026-06-01
Project: `pi-web`
Status: Draft
Source Spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`
Source PRD: `docs/superpowers/prd/2026-06-01-pi-web-enterprise-workbench-prd.md`

## 1. Objective

Implement the first phase of `pi-web` as a scene-driven, chat-heavy AI workbench for enterprise non-developers, while preserving the current session runtime as the execution core.

The plan focuses on:

- minimal structural change to the working runtime
- clear product-layer additions
- phased delivery with early validation

## 2. Delivery Principles

- preserve existing session and streaming behavior where possible
- add product structure above the runtime instead of rewriting the runtime
- introduce a `Scene` layer before broad platform expansion
- ship narrow vertical slices instead of a wide unfinished shell
- keep business-user navigation simple and technical configuration secondary

## 3. Workstreams

### Workstream A: Scene Domain Model

Goal:

- introduce `Scene`, `Action`, and `Source` as product-layer objects

Key outputs:

- shared TypeScript types for scene domain objects
- storage shape for scene definitions
- mapping rules from scene config to runtime session creation

Initial scope:

- static or file-backed configuration is acceptable
- admin editing UI is not required in the first implementation slice

### Workstream B: Scene-Aware Session Launch

Goal:

- allow users to enter a business scene and start a session with scene-specific defaults

Key outputs:

- scene-aware session launch API
- binding between scene configuration and runtime session context
- initial support for suggested starters and allowed actions

### Workstream C: Homepage And Navigation

Goal:

- replace or augment the current default landing flow with a scene portal

Key outputs:

- homepage scene cards
- recent scenes or recent work section
- navigation entry points for home, scene pages, history, and settings

### Workstream D: Scene Work Page

Goal:

- adapt the current chat experience into a reusable scene page shell

Key outputs:

- scene header and description
- starter prompts or templates
- main chat area
- action surface for next-step operations
- optional related history panel

### Workstream E: History / My Work

Goal:

- expose past work in business language instead of raw session-tree language

Key outputs:

- history list view
- scene name, title, timestamp, and status metadata
- reopen path into prior work

### Workstream F: Settings Realignment

Goal:

- keep technical configuration available while moving it out of the main user journey

Key outputs:

- settings entry point
- retained models and skills pages or panels
- navigation separation between user workbench and platform settings

### Workstream G: Result Actions

Goal:

- make outputs useful beyond chat display

Key outputs:

- copy action
- export action
- hooks for later workflow forwarding

## 4. Proposed Phases

### Phase 1: Foundation

Target:

- establish the scene model and basic navigation

Scope:

- define scene types
- choose initial scene storage mechanism
- add homepage route or home state
- add scene page shell
- wire scene selection to session launch

Exit criteria:

- a user can open the home portal
- a user can choose one of two seed scenes
- a user lands in a scene-specific chat page with correct scene framing

### Phase 2: Initial Scene Vertical Slices

Target:

- ship two complete scene experiences first

Scope:

- enterprise knowledge assistant
- report generation assistant
- suggested starters
- basic next actions

Exit criteria:

- both scenes are usable end to end
- scene framing is visible and consistent
- outputs can be copied or exported

### Phase 3: Expand To Four Initial Scenes

Target:

- broaden the business surface without changing the product model

Scope:

- customer communication assistant
- process execution assistant
- reusable scene card patterns
- history view foundation

Exit criteria:

- all four scenes are discoverable from home
- all four scenes can create or resume scene-linked work
- history shows scene-linked records

### Phase 4: Workbench Hardening

Target:

- make the product reusable and measurable

Scope:

- richer history metadata
- better action surfaces
- basic usage visibility
- simple automation entry points if runtime support is ready

Exit criteria:

- product can measure scene usage
- users can return to previous work
- business outcomes are easier to export or continue

## 5. Data Model Plan

### Scene

Recommended initial fields:

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

Implementation note:

- phase one can store scenes in a simple configuration module or file
- later phases can move to a dedicated persistence layer

### Session Product Metadata

Recommended added product-layer metadata:

- `sceneId`
- `title`
- `status`
- `lastResultSummary`
- `startedAt`
- `updatedAt`

Implementation note:

- do not rewrite the runtime session file format immediately if not necessary
- attach product metadata through a lightweight compatibility layer first

### Action

Recommended initial fields:

- `id`
- `label`
- `type`
- `description`
- `requiresInput`
- `enabled`

Implementation note:

- action execution can initially map to frontend behavior or prompt variants before deeper workflow execution exists

### Source

Recommended initial fields:

- `id`
- `name`
- `type`
- `pathOrRef`
- `scope`
- `enabled`

Implementation note:

- the first implementation can support only a narrow source subset
- preserve the object boundary for future growth

## 6. API Plan

The current runtime-facing APIs remain useful:

- `sessions`
- `agent`
- `models`
- `skills`

Add product-layer APIs incrementally.

### Stage 1 API Additions

- `GET /api/scenes`
- `GET /api/scenes/[id]`
- `POST /api/scenes/[id]/launch`

Purpose:

- list available scenes
- fetch scene metadata
- create or continue a scene-aware session

### Stage 2 API Additions

- `GET /api/history`
- `GET /api/history/[id]`

Purpose:

- return scene-oriented work history without exposing raw runtime structure directly

### Stage 3 API Additions

- `GET /api/usage`
- `GET /api/automation`
- `POST /api/automation/run`

Purpose:

- expose basic measurement and operational hooks once the scene foundation is stable

## 7. Frontend Plan

### Navigation

Add or adapt navigation for:

- home
- scene page
- history
- settings

Implementation note:

- keep the existing chat surface reusable
- avoid building a second independent chat stack

### Homepage

Build a scene portal page that includes:

- hero or guidance copy
- scene cards
- recent work
- optional quick chat entry

### Scene Page

Refactor or wrap the current chat window so it can render inside a scene shell with:

- scene identity
- starter prompts
- actions
- optional related history

### History

Build a business-facing list view instead of a raw session browser as the default history entry for non-developer users.

### Settings

Relocate or regroup models and skills to reduce their prominence in the main user flow.

## 8. Backend Plan

### Runtime Preservation

Do not replace the existing session runtime path early.

Instead:

- keep `AgentSession` and streaming logic intact
- insert scene-aware launch and metadata binding around them

### Scene Configuration Loading

Phase one options, ordered by simplicity:

1. checked-in static configuration
2. local file-backed configuration
3. API-backed persisted configuration

Recommendation:

- start with checked-in or file-backed scene configuration

### History Aggregation

History should be derived from runtime sessions plus scene metadata.

Recommendation:

- implement a product-layer history adapter instead of exposing raw session structures directly

## 9. Initial Scene Definition Plan

Implement the four starting scenes in this order:

1. Enterprise Knowledge Assistant
2. Report Generation Assistant
3. Customer Communication Assistant
4. Process Execution Assistant

Reasoning:

- the first two are easiest to express through a chat-heavy interface
- they validate the core scene model without requiring heavy workflow infrastructure
- the latter two expand into more structured action patterns after the model is proven

## 10. Validation Plan

### Product Validation

Validate:

- users understand the scene homepage
- users choose scenes instead of defaulting to raw chat
- users can produce usable outputs quickly

Signals:

- first-scene entry rate
- repeat scene usage
- export or copy actions

### Engineering Validation

Validate:

- existing chat behavior still works inside scene pages
- scene launch correctly binds context
- history re-entry works

Signals:

- no regression in session launch or streaming
- stable scene-to-session mapping
- acceptable navigation state recovery

## 11. Testing Strategy

### Phase 1

- typecheck and lint for new scene domain code
- targeted unit coverage for scene config loading and launch mapping
- UI-level verification for homepage routing and scene selection

### Phase 2

- targeted tests for scene-specific launch behavior
- tests for history metadata mapping
- tests for result actions where logic exists

### Phase 3

- add coverage for usage and automation endpoints once introduced

Implementation note:

- keep tests focused on scene binding, navigation, and adapter logic
- avoid low-value snapshot-heavy coverage

## 12. Dependencies And Sequencing

### Must Happen First

- decide scene configuration storage approach
- define scene domain types
- define scene launch contract

### Can Follow In Parallel

- homepage UI
- scene shell UI
- history adapter design

### Should Come Later

- usage analytics
- automation
- permissions
- richer source management

## 13. Main Risks

### Risk 1: Product shell lands without real scene differentiation

Mitigation:

- require each initial scene to define starters, outputs, and actions distinctly

### Risk 2: Runtime coupling becomes too brittle

Mitigation:

- layer scene binding around the existing runtime instead of rewriting internals

### Risk 3: History becomes confusing

Mitigation:

- present business-facing summaries rather than internal tree structures

### Risk 4: Scope expands into admin and platform work too early

Mitigation:

- hold usage, automation, and admin features behind later phases

## 14. Recommended First Implementation Slice

The best first implementation slice is:

- define the scene domain model
- create a homepage with two scene cards
- allow scene-aware launch into a wrapped chat page
- ship enterprise knowledge assistant and report generation assistant first

This slice proves:

- the scene abstraction works
- chat-heavy interaction remains viable
- the new homepage and navigation model are understandable

## 15. Handoff Checklist

Before starting code implementation:

- confirm the document paths and naming are acceptable
- confirm the initial two scenes for phase one
- confirm whether scene configuration should start checked-in or file-backed
- confirm whether history should be part of the first implementation slice or the second

## 16. Recommended Immediate Next Tasks

1. Create shared scene domain types
2. Define scene seed configuration for the first two scenes
3. Design the homepage route and scene card component
4. Design the scene-aware launch API contract
5. Wrap the existing chat view in a scene page shell
6. Add result copy and export actions
