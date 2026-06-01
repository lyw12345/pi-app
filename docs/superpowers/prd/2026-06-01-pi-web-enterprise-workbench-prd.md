# pi-web Enterprise Workbench PRD

Date: 2026-06-01
Project: `pi-web`
Status: Draft
Source Spec: `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md`

## 1. Product Overview

`pi-web` will evolve from a developer-oriented session UI into a scene-driven AI workbench for enterprise non-developers.

The first release is a chat-heavy business workbench:

- users enter through business scenes instead of raw sessions
- chat remains the primary interaction inside each scene
- scenes constrain purpose, context, output style, and next actions
- platform capabilities such as models and skills move to secondary settings areas

The product goal is to let non-technical users complete everyday business tasks through guided AI interactions without needing to understand models, tools, or agent internals.

## 2. Background And Problem

Current `pi-web` is strongest as a session-centric coding agent interface. That makes it powerful for technical users, but it creates three barriers for enterprise non-developers:

- the product is organized around technical primitives such as sessions, models, and tools
- users are not guided toward concrete business tasks
- repeated work is hard to package into stable, understandable business entry points

At the same time, enterprise teams need an AI workspace that is:

- simple to enter
- task-oriented
- reusable across repeated business scenarios
- extensible into a broader platform later

This PRD defines the first product step toward that direction.

## 3. Product Vision

Build `pi-web` into a scene-driven AI workbench where enterprise users can:

- choose a business scene
- complete work mainly through chat
- receive structured outputs and next-step actions
- return to previous work easily

Longer term, this workbench can grow into a wider enterprise AI platform with richer sources, automation, analytics, and admin configuration. The first release does not attempt to deliver that full platform.

## 4. Target Users

Primary users:

- enterprise non-developers

Likely early cohorts:

- operations teams
- sales and customer-facing teams
- internal knowledge workers
- product operations or business operations staff

Early release assumption:

- the first version uses a unified interface
- there is no hard admin versus end-user product split yet
- the product architecture must still allow that split later

## 5. Jobs To Be Done

Users should be able to:

- find the right AI capability for a business task quickly
- ask business questions without understanding technical configuration
- generate reusable outputs such as reports, summaries, and reply drafts
- run simple structured processes from guided prompts or templates
- revisit previous work without navigating raw session trees

## 6. Product Principles

- expose `Scene`, not `Session`, as the primary product object
- keep chat heavy in the first release to reduce user friction
- package technical capability into business-facing actions
- keep first-release scope narrow and complete
- preserve a path toward future platform expansion without overbuilding early

## 7. First-Release Scope

### In Scope

- scene-driven homepage
- scene work page with chat as the primary interaction
- four initial business scenes
- history / my work page
- lightweight scene model
- basic platform settings retained for models and skills

### Out Of Scope

- heavy role and permission systems
- full enterprise admin console
- full channel integrations
- desktop-host features from `ClawX`
- developer-first capabilities from `claude-code` such as LSP, bridge, or worktree
- heavy low-code workflow building

## 8. Initial Scenes

The first release should launch with four scenes:

### 8.1 Enterprise Knowledge Assistant

Purpose:

- answer questions over enterprise information and reference materials

Typical outputs:

- direct answers
- concise summaries
- source-backed explanations

Typical actions:

- copy answer
- export summary
- continue follow-up chat

### 8.2 Report Generation Assistant

Purpose:

- generate structured reports from user prompts and optional source materials

Typical outputs:

- weekly reports
- monthly reports
- meeting summaries

Typical actions:

- regenerate
- refine tone or structure
- export result

### 8.3 Customer Communication Assistant

Purpose:

- draft and refine external communication

Typical outputs:

- reply drafts
- tone-adjusted versions
- risk-aware suggestions

Typical actions:

- copy draft
- regenerate with a different tone
- export or send to another workflow

### 8.4 Process Execution Assistant

Purpose:

- help users trigger or complete repeatable structured tasks

Typical outputs:

- processed summaries
- workflow-ready output
- execution results

Typical actions:

- choose a template
- provide missing inputs
- review and export the result

## 9. Core Experience

### 9.1 Homepage

The homepage should:

- show business scene cards as the main entry point
- highlight recent scenes
- show pending results or recent work
- optionally retain a lightweight global chat entry without making it dominant

Success condition:

- a first-time user understands what the product can do within one minute

### 9.2 Scene Page

The scene page is the core work surface.

It should include:

- scene title and explanation
- suggested prompts or starters
- main chat area
- structured next actions
- recent outputs or related history

Success condition:

- a user can start meaningful work in a scene within three steps

### 9.3 History / My Work

The history area should:

- show previous scene runs
- display titles or summaries
- expose current status
- allow easy re-entry

Success condition:

- users can find prior work without understanding the internal session tree model

### 9.4 Platform Settings

The settings area should:

- preserve existing technical configuration capability
- keep models and skills accessible without making them the main product surface
- act as the seed of future admin/operator capability

## 10. Product Object Model

### Scene

`Scene` is the primary product object.

It defines:

- business purpose
- default prompt framing
- source boundaries
- output style
- suggested starters
- allowed next-step actions

### Session

`Session` remains the runtime object for a specific user interaction.

At the product layer it should carry business context such as:

- `sceneId`
- `title`
- `userId`
- `status`
- `lastResultSummary`

### Action

`Action` is a user-understandable business operation, not a raw tool.

Examples:

- export report
- draft customer reply
- submit next step

### Source

`Source` represents the data or knowledge boundary a scene may use.

This object should remain separate from prompts so future source governance can be built cleanly.

## 11. User Flows

### Flow A: Knowledge Q&A

- user opens homepage
- user enters enterprise knowledge assistant
- user asks a question
- system answers with references and next actions
- user copies, exports, or continues

### Flow B: Report Generation

- user opens homepage
- user enters report generation assistant
- user provides request and optional material
- system returns structured content
- user refines and exports

### Flow C: Customer Communication

- user opens homepage
- user enters customer communication assistant
- user pastes a message or context
- system returns a draft and guidance
- user edits and exports

### Flow D: Process Execution

- user opens homepage
- user enters process execution assistant
- user starts from a template or describes the task
- system runs the task and returns the result
- user reviews and takes a next action

## 12. Functional Requirements

### FR-1 Scene Portal

- system shows a homepage with scene cards
- system supports opening a scene directly from the homepage
- system shows recent scenes or recent work

### FR-2 Scene Runtime Binding

- each scene is bound to a scene configuration
- entering a scene creates or continues a session with scene context applied
- scene context constrains purpose, output, and available actions

### FR-3 Chat-Heavy Scene Interaction

- chat is the default interaction mode inside a scene
- scene pages can show suggested prompts and quick actions
- scene pages can evolve later to include form-like inputs where needed

### FR-4 History

- users can view previous scene runs
- each run shows scene, title or summary, timestamp, and status
- users can reopen prior work

### FR-5 Action Surface

- each scene exposes user-facing next actions
- actions map to business semantics rather than raw tool names

### FR-6 Basic Settings Preservation

- models and skills remain accessible
- these settings are moved away from the main business-user journey

## 13. Success Metrics

### Adoption Metrics

- percentage of users who enter a scene from the homepage
- repeat usage of the same scene over time
- distribution of usage across the initial four scenes

### Usability Metrics

- time to first successful scene interaction
- number of steps from homepage to first useful output
- rate of session abandonment on the first visit

### Output Metrics

- export or copy rate of generated results
- follow-up interaction rate inside scenes
- scene completion rate for structured tasks

### Platform Learning Metrics

- which scenes are used most often
- which actions are clicked most often
- which sources contribute to the most valuable interactions

## 14. Release Plan

### MVP-1

- scene homepage
- scene page shell
- enterprise knowledge assistant
- report generation assistant

### MVP-2

- customer communication assistant
- process execution assistant
- history / my work
- result export

### MVP-3

- usage visibility
- basic automation entry points
- lightweight scene configuration page

## 15. Risks And Mitigations

### Risk: Product stays session-centric

Mitigation:

- keep scene as the main navigation and product language

### Risk: Chat overwhelms scene identity

Mitigation:

- require each scene to define purpose, starters, output style, and actions

### Risk: Scope expands into a full enterprise platform too early

Mitigation:

- keep first release focused on four scenes and a small set of pages

### Risk: Web product copies desktop-host complexity from `ClawX`

Mitigation:

- borrow product expression only, not desktop host implementation assumptions

## 16. Open Follow-Up Topics

These are not blockers for the first PRD, but they will need later product decisions:

- when to split admin and business-user views
- how formal source management should become
- what level of automation belongs in the first operational release
- when to introduce permissions and audit features

## 17. Final Recommendation

The first product release should validate one core bet:

enterprise non-developers will adopt `pi-web` if it presents AI capability as business scenes while preserving low-friction chat interaction.

That means the right first step is:

- scene-driven homepage
- chat-heavy scene pages
- four focused scenes
- history and basic settings

This release should validate usability and repeated business usage before `pi-web` expands into a larger enterprise AI platform.
