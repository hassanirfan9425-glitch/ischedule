// Always relative: in prod Netlify proxies /api/* to Render (see netlify.toml) so the cookie stays
// same-site; in dev Vite's own dev-server proxy sends /api to localhost:4000.
const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
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

  calculateSubjectTarget: (payload) =>
    request('/calculator/subject-target', { method: 'POST', body: JSON.stringify(payload) }),
  calculateOverallTarget: (payload) =>
    request('/calculator/overall-target', { method: 'POST', body: JSON.stringify(payload) }),
};
