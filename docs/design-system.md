# Design System - Scam Risk Detector

## 1. Design Direction

The product should look like a serious analytical utility, not an AI landing-page template.

Desired impression:

- calm
- credible
- precise
- lightweight
- modern
- human-designed
- information-first

Avoid visual language associated with generic AI products.

## 2. Hard Rules

The following are prohibited:

- gradients
- glassmorphism
- translucent frosted cards
- excessive blur
- glowing borders
- neon accents
- oversized decorative illustrations
- AI-generated hero artwork
- floating blobs
- excessive rounded cards
- excessive shadows
- excessive animation
- emoji in UI copy
- giant all-caps headings
- overly heavy typography
- fake terminal/chatbot aesthetics
- dashboard cards for information that does not need cards

Do not add visual effects merely because the CSS makes them possible.

## 3. Typography

Primary font preference:

1. Poppins
2. Quicksand as fallback/alternative where appropriate

Recommended weights:

- 400: body
- 500: labels, navigation, supporting emphasis
- 600: headings and primary emphasis
- 700: use sparingly for major score/risk labels only

Do not make entire sections bold.

Suggested type scale:

```text
Display: 40-48px / 1.1 / 600
H1:      32px / 1.2 / 600
H2:      24px / 1.25 / 600
H3:      18px / 1.35 / 600
Body:    15-16px / 1.6 / 400
Small:   13-14px / 1.5 / 400
Label:   12-13px / 1.4 / 500
```

The goal is readable hierarchy, not typographic shouting.

## 4. Color System

Use a mostly neutral interface with a restrained semantic accent system.

Suggested tokens:

```text
Background:        #FAFAF8
Surface:           #FFFFFF
Surface Secondary: #F3F4F6
Border:            #E5E7EB
Text Primary:      #171717
Text Secondary:    #525252
Text Muted:        #737373
Accent:            #2563EB
Accent Hover:      #1D4ED8

Low:               #15803D
Medium:            #A16207
High:              #C2410C
Critical:          #B91C1C
```

Important:

- semantic risk colors should support hierarchy, not flood the entire interface
- do not make the whole screen red for a high-risk result
- use color together with text labels
- maintain sufficient contrast

## 5. Layout

Use a restrained editorial layout.

Suggested desktop width:

```text
max-width: 1100-1200px
```

Suggested analyzer content width:

```text
max-width: 760-820px
```

Use generous whitespace but avoid huge empty hero sections.

Suggested spacing scale:

```text
4   6   8   12   16   20   24   32   40   48   64
```

## 6. Containers

Preferred:

- flat white surface
- subtle border
- small radius
- minimal shadow or no shadow

Suggested radius:

```text
Small control: 8px
Card:          12px
Large panel:   16px
```

Do not use 24-32px rounded corners across everything.

## 7. Buttons

Primary button:

- solid accent color
- medium weight
- clear label
- no gradient
- no glow
- no animated shine

Secondary button:

- neutral or outlined
- visually subordinate to primary action

Example:

```text
[ Analyze content ]
```

Avoid:

```text
[ Analyze with AI ]
```

The product already contains AI. Advertising the word on every button is unnecessary.

## 8. Text Input

The analyzer textarea is the central interaction.

Requirements:

- large enough for multiple paragraphs
- visible label
- useful placeholder
- clear focus state
- visible error state
- no floating-label gimmicks

Suggested dimensions:

```text
min-height: 220-280px
```

Placeholder example:

```text
Paste an investment or money-making promotion you want to analyze...
```

## 9. Risk Score

Risk score should be readable without becoming theatrical.

Preferred composition:

```text
HIGH RISK
87 / 100
```

Use a compact indicator such as a progress bar or meter if useful.

Do not use:

- giant circular glowing gauges
- animated radial charts
- 3D charts
- rainbow scales

## 10. Risk Flags

Each red flag should communicate:

```text
Title
Severity
Evidence
Explanation
```

Example:

```text
Unrealistic Return                         HIGH

Evidence
"30% profit in 7 days"

Explanation
The promotion promises an unusually high return within a short period.
```

Use small semantic markers or icons only when they improve scanning.

## 11. Icons

If icons are needed, use Lucide React or another simple line icon set.

Rules:

- 16-20px for normal UI
- 20-24px for prominent sections
- consistent stroke width
- never use icons purely as decoration everywhere

Do not use emojis as UI icons.

## 12. Motion

Motion should communicate state changes only.

Allowed:

- button loading state
- subtle result reveal
- small expand/collapse transitions

Avoid:

- parallax
- floating cards
- continuous animation
- animated gradients
- cursor-following effects
- excessive spring animations

## 13. Responsive Behavior

Desktop:

- centered content
- two-column result layout is acceptable if it improves scanning

Mobile:

- single column
- textarea full width
- risk summary first
- red flags stacked
- actions remain easy to reach

Do not shrink desktop UI until it technically fits. Reflow it.

## 14. Content Style

Tone:

- neutral
- direct
- evidence-focused
- non-accusatory

Prefer:

"The content contains several high-risk indicators."

Avoid:

"This is definitely a scam!"

Prefer:

"The promotion contains a claim of unusually high returns."

Avoid:

"This is obviously fake."

## 15. Anti-Slop Checklist

Before merging a UI change, ask:

- Did I add a gradient?
- Did I add glass/blur without a functional reason?
- Did I use a giant rounded card?
- Did I make the typography unnecessarily bold?
- Did I add an animation that does not communicate state?
- Did I add an icon where text was clearer?
- Did I use an emoji in the interface?
- Does this look like a generic AI dashboard?
- Can the same information be shown more simply?

If the answer is yes, simplify it.
