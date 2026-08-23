export default function PrivacyTerms({ onBack }) {
  return (
    <div className="centered-screen">
      <div className="upload-card policy-card">
        {onBack && (
          <button type="button" className="back-link" onClick={onBack}>
            ← Back
          </button>
        )}
        <h1>Privacy Policy &amp; Terms</h1>
        <p className="subtle">Last updated for the beta launch. Written in plain language, not legal boilerplate.</p>

        <h2>What we collect</h2>
        <p>
          Your username, name, and a hashed version of your password (we never store or see your actual
          password, only a one way hash used to check it). The difficulty ratings you give each subject.
          Any calendar, grade report, or study material you upload. The grades you enter yourself. Any
          study plans, goals, or suggestions the app generates for you. Your theme and UI style choices.
        </p>

        <h2>How the AI features work</h2>
        <p>
          When you upload a calendar, a grade report, or study material, that file is sent to Google's
          Gemini AI so it can automatically read it and pull out the information (exam dates, holidays,
          grades, and so on). This is how the automatic upload features work. If you would rather not
          send a document to an outside AI, every part of the app also supports entering things manually
          instead.
        </p>

        <h2>Who can see your data</h2>
        <p>
          Only the developer of this app, for the purpose of running it, fixing bugs, and improving it.
          Your data is not sold or shared with anyone else. This app is currently a small beta test for a
          limited group of students, not a public product yet.
        </p>

        <h2>Deleting your account</h2>
        <p>
          You can delete your account at any time from the menu. This permanently removes your account
          and everything tied to it (grades, schedule, materials, study plans) from the database. This
          cannot be undone once you confirm it.
        </p>

        <h2>Terms of use</h2>
        <p>
          This app is provided as is, during an active beta test, and may have bugs or occasional
          downtime. Grade averages, calculators, and suggestions are estimates meant to help you plan.
          Your school's own official records are always the real, final numbers, not anything shown here.
        </p>
        <p>
          Please use your own real account with your own real information, do not share your account with
          anyone else, and do not try to overload the app with excessive automated requests. Uploaded
          documents should be your own schedule, grades, or study material, not someone else's.
        </p>
        <p>
          These terms may be updated as the app changes. Continuing to use the app after an update means
          you accept the new version.
        </p>
      </div>
    </div>
  );
}
