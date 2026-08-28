import { cacheResponse, getCachedResponse } from './offline/db.js';
import { subjectTargetOffline, overallTargetOffline } from './offline/calculatorMath.js';
import { enqueue as enqueueMutation } from './offline/mutationQueue.js';

// Always relative: in prod Vercel rewrites /api/* to Render (see client/vercel.json) so the cookie
// stays same-site; in dev Vite's own dev-server proxy sends /api to localhost:4000.
const API_BASE = '/api';

async function request(path, options = {}) {
  const isGet = !options.method || options.method === 'GET';
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (networkErr) {
    // fetch itself throwing (no response at all) is the same "can't reach the server" signal as
    // below — status stays undefined either way, so a GET can still fall back to cache here.
    if (isGet) {
      const cached = await getCachedResponse(path);
      if (cached) return { ...cached.data, _offline: { fromCache: true, cachedAt: cached.cachedAt } };
    }
    // A mutating request against a verified-safe route (see offline/mutationQueue.js's allowlist)
    // gets queued for replay instead of failing outright — anything not on that allowlist (AI
    // uploads, auth, bulk term operations) falls through to the normal thrown error below. DELETE
    // calls here have no body at all (the id is in the URL), so options.body may be undefined.
    if (!isGet && !(options.body instanceof FormData)) {
      const queued = await enqueueMutation(options.method, path, options.body);
      if (queued) return queued;
    }
    throw networkErr;
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    // Lets callers tell "genuinely not logged in" (401) apart from a transient/gateway failure
    // (503 while the free-tier host is cold-starting, a dropped connection, etc) without having
    // to parse the message string — see App.jsx's session-check retry loop.
    err.status = res.status;
    throw err;
  }
  if (isGet) cacheResponse(path, data);
  return data;
}

export const api = {
  me: () => request('/auth/me'),
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  signup: (username, name, password, acceptedTerms) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ username, name, password, acceptedTerms }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  deleteAccount: () => request('/auth/account', { method: 'DELETE' }),
  updateProfile: (fields) => request('/auth/profile', { method: 'PATCH', body: JSON.stringify(fields) }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) }),
  completeTutorial: () => request('/auth/tutorial-complete', { method: 'POST' }),

  getThemes: () => request('/themes'),

  getSubjectCatalog: () => request('/subjects'),
  getMySubjects: () => request('/subjects/mine'),
  saveMySubjects: (subjects, periodicDay) =>
    request('/subjects/mine', { method: 'POST', body: JSON.stringify({ subjects, periodicDay }) }),
  updateSubjectDifficulty: (subjectKey, difficulty) =>
    request(`/subjects/mine/${subjectKey}`, { method: 'PATCH', body: JSON.stringify({ difficulty }) }),

  uploadSchedule: (file) => {
    const form = new FormData();
    form.append('schedule', file);
    return request('/schedule/upload', { method: 'POST', body: form });
  },

  getDashboard: () => request('/dashboard'),
  getScheduleStatus: () => request('/schedule/status'),
  deleteSchedule: () => request('/schedule', { method: 'DELETE' }),
  deleteFinalSchedule: () => request('/schedule/final', { method: 'DELETE' }),
  finalizeScheduleReview: (uploadId, exams) =>
    request('/schedule/finalize', { method: 'POST', body: JSON.stringify({ uploadId, exams }) }),
  discardScheduleReview: (uploadId) =>
    request('/schedule/discard', { method: 'POST', body: JSON.stringify({ uploadId }) }),

  getManualExams: () => request('/manual-exams'),
  addManualExam: (exam) => request('/manual-exams', { method: 'POST', body: JSON.stringify(exam) }),
  deleteManualExam: (id) => request(`/manual-exams/${id}`, { method: 'DELETE' }),
  finishManualEntry: () => request('/manual-exams/finish', { method: 'POST' }),

  uploadMaterial: (examId, file) => {
    const form = new FormData();
    form.append('material', file);
    return request(`/materials/${examId}`, { method: 'POST', body: form });
  },
  addManualMaterial: (examId, { quizzes, questions }) =>
    request(`/materials/${examId}/manual`, { method: 'POST', body: JSON.stringify({ quizzes, questions }) }),
  deleteMaterial: (examId) => request(`/materials/${examId}`, { method: 'DELETE' }),

  getStudyPlan: (examId) => request(`/materials/${examId}/study-plan`),
  generateStudyPlan: (examId, daysUntil) =>
    request(`/materials/${examId}/study-plan`, { method: 'POST', body: JSON.stringify({ daysUntil }) }),
  getAllStudyPlans: () => request('/materials/study-plans'),

  getAcademics: () => request('/academics'),
  uploadGrades: (file) => {
    const form = new FormData();
    form.append('grades', file);
    return request('/academics/upload', { method: 'POST', body: form });
  },
  addGradeManual: (entry) => request('/academics/manual', { method: 'POST', body: JSON.stringify(entry) }),
  deleteGradeEntry: (id) => request(`/academics/${id}`, { method: 'DELETE' }),
  deleteGradesByTerm: (term) => request(`/academics/term/${term}`, { method: 'DELETE' }),
  changeGradeTerm: (fromTerm, toTerm) =>
    request('/academics/term', { method: 'PATCH', body: JSON.stringify({ fromTerm, toTerm }) }),

  getPendingReflection: () => request('/reflections/pending'),
  submitReflection: (examId, rating) =>
    request('/reflections', { method: 'POST', body: JSON.stringify({ examId, rating }) }),
  dismissReflectionNudge: (reflectionId) =>
    request(`/reflections/${reflectionId}/dismiss-nudge`, { method: 'PATCH' }),

  setGoal: (payload) => request('/goals', { method: 'PUT', body: JSON.stringify(payload) }),
  deleteGoal: (goalId) => request(`/goals/${goalId}`, { method: 'DELETE' }),

  calculateSubjectTarget: (payload) => calculateWithOfflineFallback('subject-target', payload),
  calculateOverallTarget: (payload) => calculateWithOfflineFallback('overall-target', payload),
};

// The calculator endpoints are pure functions of data the app already caches (grade entries via
// /academics, exam schedule via /dashboard, subject catalog via /subjects) — see
// offline/calculatorMath.js. A genuine connectivity failure here re-derives the same answer from
// whatever was last cached instead of just failing, so GradeCalculatorPopup keeps working offline
// with no changes of its own.
async function calculateWithOfflineFallback(kind, payload) {
  try {
    return await request(`/calculator/${kind}`, { method: 'POST', body: JSON.stringify(payload) });
  } catch (err) {
    if (err.status !== undefined) throw err;
    const [academics, dashboard, catalog] = await Promise.all([
      getCachedResponse('/academics'),
      getCachedResponse('/dashboard'),
      getCachedResponse('/subjects'),
    ]);
    if (!academics || !dashboard || !catalog) throw err;
    const termData = academics.data.terms.find((t) => t.term === payload.term);
    if (!termData) throw err;

    if (kind === 'subject-target') {
      return subjectTargetOffline({
        term: payload.term,
        subjectKey: payload.subjectKey,
        subjectLabel: payload.subjectLabel,
        targetAverage: payload.targetAverage,
        entries: termData.entries,
        upcomingExams: dashboard.data.allUpcomingExams,
      });
    }

    const result = overallTargetOffline({
      term: payload.term,
      subjects: payload.subjects,
      targetOverallAverage: payload.targetOverallAverage,
      subjectAverages: termData.subjectAverages,
      currentOverallAverage: termData.overallAverage,
      subjectCatalog: catalog.data.subjects,
    });
    if (result.error) {
      const validationErr = new Error(result.error);
      validationErr.status = 422;
      throw validationErr;
    }
    return result;
  }
}
