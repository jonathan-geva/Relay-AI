import type { Prompt } from "./domain";
export const builtins: Prompt[] = [
  {
    id: "summarize",
    title: "Find the Essentials",
    description: "A short summary, key points, and next steps",
    category: "Understand",
    instruction:
      "Summarize the supplied text. Use a short overview, key points, and actionable next steps if relevant. Stay faithful to the source; flag missing information.",
  },
  {
    id: "explain",
    title: "Explain Simply",
    description: "Clear explanations with a concrete example",
    category: "Understand",
    instruction:
      "Explain the supplied material in plain language. Define unfamiliar terms and give a useful example. Preserve nuance and state uncertainty.",
  },
  {
    id: "actions",
    title: "Extract Action Items",
    description: "Turn meeting notes into a practical checklist",
    category: "Understand",
    instruction:
      "Extract action items from these notes as a checklist. Include owners and deadlines only where explicitly given; otherwise label them unassigned or unspecified. Separate decisions and open questions.",
  },
  {
    id: "polish",
    title: "Polish Writing",
    description: "Clearer wording that still sounds like you",
    category: "Write",
    instruction:
      "Improve grammar, flow, and clarity while preserving meaning, language, and voice. Return only the revised text.",
  },
  {
    id: "shorten",
    title: "Make It Concise",
    description: "Cut repetition while keeping what matters",
    category: "Write",
    instruction:
      "Make this text concise without losing essential facts or intent. Preserve the original language and tone. Return only the revised text.",
  },
  {
    id: "reply",
    title: "Draft a Thoughtful Reply",
    description: "A professional response you can review and paste",
    category: "Write",
    instruction:
      "Draft a clear, friendly, professional reply to this message. Do not invent personal details, commitments, or availability. Use placeholders where needed. Return only the draft.",
  },
  {
    id: "translate",
    title: "Translate Text",
    description: "Specify a target language alongside your text",
    category: "Write",
    instruction:
      "Translate the supplied text into the target language specified by the user. Preserve tone, formatting, and meaning. If no target language is specified, ask for it before translating.",
  },
  {
    id: "review",
    title: "Review Code",
    description: "Find concrete bugs and suggest focused fixes",
    category: "Build",
    instruction:
      "Review the supplied code for correctness, security, and maintainability. Prioritize concrete bugs with severity, explain their impact, and suggest focused fixes. State assumptions. Do not claim to have run the code.",
  },
  {
    id: "debug",
    title: "Debug an Error",
    description: "Understand the cause and choose the next step",
    category: "Build",
    instruction:
      "Help diagnose this error using the supplied code and context. Explain likely causes, distinguish evidence from guesses, and give ordered troubleshooting steps. Ask for essential missing details.",
  },
  {
    id: "brainstorm",
    title: "Explore Possibilities",
    description: "Five distinct ideas with useful trade-offs",
    category: "Think",
    instruction:
      "Generate five distinct, practical ideas for the supplied goal. For each, give the approach, main benefit, trade-off, and first step. Respect all supplied constraints.",
  },
];
