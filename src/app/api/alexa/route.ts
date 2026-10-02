import {
  alexaConfigured,
  askEllie,
  deadlineFrom,
  isForOurSkill,
  isFromAmazon,
  say,
  sayOneMoment,
  waitForAnswer,
  type AlexaRequest,
} from "@/lib/alexa";
import { CONTINUE_INTENT, QUESTION_INTENTS } from "@/lib/alexaModel";

// The Alexa skill's endpoint (Alexa console → Build → Endpoint → HTTPS). Amazon signs every request;
// anything unsigned, or for another skill, gets 400 as Amazon requires.

const HELP =
  "You can ask me anything about your CDA appliance. Start with a question word, for example: " +
  "why is my oven showing F3, how do I register my appliance, or what is the spare parts phone number?";

export async function POST(request: Request) {
  const start = Date.now();
  const rawBody = await request.text();
  if (!(await isFromAmazon(request, rawBody))) return Response.json({ error: "Invalid signature" }, { status: 400 });

  let body: AlexaRequest;
  try {
    body = JSON.parse(rawBody) as AlexaRequest;
  } catch {
    return Response.json({ error: "Unreadable request" }, { status: 400 });
  }
  if (!isForOurSkill(body)) return Response.json({ error: "Wrong skill or stale request" }, { status: 400 });
  if (!alexaConfigured()) return Response.json(say("Sorry, CDA Assistant is not set up yet.", {}, true));

  const session = { ...body.session?.attributes };
  const type = body.request?.type;
  if (type === "SessionEndedRequest") return Response.json({ version: "1.0", response: {} });
  if (type === "LaunchRequest") {
    return Response.json(say("Hi, I'm Ellie, CDA's virtual assistant. What can I help you with?", session));
  }
  if (type !== "IntentRequest") return Response.json(say("Sorry, I didn't catch that.", session));

  const intent = body.request?.intent?.name ?? "";
  if (intent === "AMAZON.StopIntent" || intent === "AMAZON.CancelIntent") return Response.json(say("Goodbye.", {}, true));
  if (intent === "AMAZON.HelpIntent" || intent === "AMAZON.NavigateHomeIntent") return Response.json(say(HELP, session));

  // An answer that took longer than Alexa waits is read out at the next word, whatever that word
  // is: nobody should have to remember a magic one. "Continue" still works, and so does anything
  // else the customer says.
  if (session.pendingMessageId) {
    const answer = await waitForAnswer(session.pendingMessageId, deadlineFrom(start, body));
    if (answer) return Response.json(say(answer, { conversationId: session.conversationId }));
    if (intent === CONTINUE_INTENT) return Response.json(say("Still checking. Speak again in a second.", session));
  } else if (intent === CONTINUE_INTENT) {
    return Response.json(say("There's nothing waiting. What would you like to ask?", session));
  }

  let text = "";
  if (intent === "AMAZON.YesIntent") text = "yes";
  else if (intent === "AMAZON.NoIntent") text = "no";
  else {
    const question = QUESTION_INTENTS.find((item) => item.intent === intent);
    const said = body.request?.intent?.slots?.question?.value?.trim();
    if (question && said) text = `${question.prefix} ${said}`.trim();
  }
  if (!text) return Response.json(say(`Sorry, I didn't get that. ${HELP}`, session));

  sayOneMoment(body);
  let asked: { conversationId: string; messageId: string };
  try {
    asked = await askEllie(body, text);
  } catch (error) {
    console.error("Alexa question could not be passed to Ellie", error);
    return Response.json(say("Sorry, I can't reach the CDA assistant right now. Please try again in a moment.", session));
  }

  const answer = await waitForAnswer(asked.messageId, deadlineFrom(start, body));
  if (answer) return Response.json(say(answer, { conversationId: asked.conversationId }));
  return Response.json(
    say("One second, I'm looking that up. Just say anything and I'll tell you.", {
      conversationId: asked.conversationId,
      pendingMessageId: asked.messageId,
    }),
  );
}
