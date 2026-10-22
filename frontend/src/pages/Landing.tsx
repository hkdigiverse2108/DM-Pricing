import { Link } from "react-router-dom";
import { useSite } from "../lib/site";

function ConversationMock() {
  return (
    <div className="mx-auto w-full max-w-md" aria-hidden>
      <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <p className="text-xs text-ink-mute">Comments on your latest reel</p>
        <div className="mt-3 space-y-3 text-sm">
          <p><span className="font-semibold">riya.crafts</span> <span className="ml-1 rounded bg-pop-50 px-1.5 py-0.5 font-medium text-pop">PRICE</span></p>
          <p className="ml-6 rounded-lg bg-canvas px-3 py-2"><span className="font-semibold">yourbrand</span> Sent you the details in DM!</p>
        </div>
      </div>
      <div className="-mt-1 ml-10 rounded-2xl bg-ink p-4 text-sm text-white shadow-lg">
        <p className="text-xs text-white/60">Direct message, 2 seconds later</p>
        <p className="mt-2 rounded-xl rounded-tl-sm bg-white/10 px-3 py-2">Hi Riya! Here is the price list you asked for.</p>
        <p className="mt-2 inline-block rounded-xl bg-brand-600 px-3 py-2 font-medium">I am following you</p>
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Connect your Instagram account", text: "Sign in with Instagram once. We keep the connection alive, so you never have to log in again every two months." },
  { title: "Choose a keyword and a message", text: "Pick the word people comment, write the DM they should receive, and optionally add replies for the public comment." },
  { title: "Comments turn into conversations", text: "When someone comments the keyword, they get your DM. You can ask them to follow you first." },
];

const CONTROLS = [
  ["Keywords", "Any word or phrase. Use one on every post, or tie a keyword to a single post or reel."],
  ["Public replies", "Add up to three comment replies. They rotate, so your replies never look copy-pasted."],
  ["Follow gate", "Ask people to follow before the DM is released, with your own message and button text."],
  ["Several accounts", "Connect more than one Instagram account and manage each one's keywords separately."],
  ["Plan limits", "Accounts, keywords, and monthly DMs follow your plan, and you can see usage at any time."],
];

export default function Landing() {
  const { heroTitle, heroSubtitle } = useSite();
  return (
    <>
      <section className="bg-canvas">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{heroTitle}</h1>
            <p className="mt-5 max-w-lg text-lg text-ink-soft">{heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700">Create free account</Link>
              <Link to="/pricing" className="rounded-lg border border-line bg-white px-6 py-3 font-medium hover:bg-canvas">See pricing</Link>
            </div>
          </div>
          <ConversationMock />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold">Set up in three steps</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 font-display font-bold text-brand-700">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-canvas">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-3">
          <h2 className="text-3xl font-bold">Everything you control</h2>
          <dl className="divide-y divide-line lg:col-span-2">
            {CONTROLS.map(([t, d]) => (
              <div key={t} className="grid gap-1 py-4 sm:grid-cols-3 sm:gap-6">
                <dt className="font-semibold">{t}</dt>
                <dd className="text-sm text-ink-soft sm:col-span-2">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-3xl font-bold">Your first keyword takes two minutes</h2>
        <p className="mx-auto mt-3 max-w-lg text-ink-soft">Start on the free plan and upgrade when your audience grows.</p>
        <Link to="/register" className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700">Create your account</Link>
      </section>
    </>
  );
}
