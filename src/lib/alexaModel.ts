// The Alexa skill's interaction model: the words that open the skill and the questions it hears.
// No imports, so `alexa/interaction-model.json` (pasted into the Alexa console) can be generated
// from this same list.
//
// A classic Alexa skill only hands over free speech (AMAZON.SearchQuery) after a fixed "carrier"
// word, so there is one intent per opening word. The route puts that word back in front of what
// was said, so Ellie hears the whole question: "why my oven shows F3", not "my oven shows F3".

export const INVOCATION_NAME = "cda assistant";

/** Opening word(s) → the words put back in front of the question for Ellie. */
export const QUESTION_INTENTS: { intent: string; samples: string[]; prefix: string }[] = [
  ...[
    "why",
    "how",
    "what",
    "what's",
    "where",
    "when",
    "which",
    "who",
    "can",
    "could",
    "do",
    "does",
    "did",
    "is",
    "are",
    "will",
    "would",
    "should",
    "my",
    "i",
    "i'm",
    "it",
    "it's",
    "the",
    "there",
    "please",
    "yes",
    "no",
    // Words people actually start with when they talk about an appliance, so almost any sentence
    // reaches Ellie instead of "start with a question word".
    "tell",
    "explain",
    "about",
    "need",
    "want",
    "give",
    "send",
    "show",
    "we",
    "you",
    "your",
    "he",
    "she",
    "they",
    "was",
    "am",
    "oven",
    "hob",
    "dishwasher",
    "fridge",
    "freezer",
    "washing",
    "dryer",
    "extractor",
    "microwave",
    "warranty",
    "parts",
    "spare",
    "delivery",
    "engineer",
    "order",
    "register",
  ].map((word) => ({
    intent: `Ask${word.replace(/'/g, "").replace(/^./, (c) => c.toUpperCase())}Intent`,
    samples: [`${word} {question}`],
    prefix: word,
  })),
  { intent: "AskGeneralIntent", samples: ["tell me {question}", "question {question}", "i want to know {question}", "help me with {question}"], prefix: "" },
];

/** Says the next part of an answer that took longer than Alexa waits. */
export const CONTINUE_INTENT = "ContinueIntent";

export function interactionModel() {
  return {
    interactionModel: {
      languageModel: {
        invocationName: INVOCATION_NAME,
        intents: [
          ...QUESTION_INTENTS.map(({ intent, samples }) => ({
            name: intent,
            slots: [{ name: "question", type: "AMAZON.SearchQuery" }],
            samples,
          })),
          { name: CONTINUE_INTENT, slots: [], samples: ["continue", "go on", "what did you find", "tell me the answer", "are you there"] },
          { name: "AMAZON.YesIntent", samples: [] },
          { name: "AMAZON.NoIntent", samples: [] },
          { name: "AMAZON.HelpIntent", samples: [] },
          { name: "AMAZON.StopIntent", samples: [] },
          { name: "AMAZON.CancelIntent", samples: [] },
          { name: "AMAZON.NavigateHomeIntent", samples: [] },
          { name: "AMAZON.FallbackIntent", samples: [] },
        ],
        types: [],
      },
    },
  };
}
