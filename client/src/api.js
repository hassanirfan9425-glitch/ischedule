const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
  signup: (username, name, password) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ username, name, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  deleteAccount: () => request('/auth/account', { method: 'DELETE' }),
  updateProfile: (fields) => request('/auth/profile', { method: 'PATCH', body: JSON.stringify(fields) }),

  getThemes: () => request('/themes'),

  getSubjectCatalog: () => request('/subjects'),
  getMySubjects: () => request('/subjects/mine'),
  saveMySubjects: (subjects, periodicDay) =>
    request('/subjects/mine', { method: 'POST', body: JSON.stringify({ subjects, periodicDay }) }),

  uploadSchedule: (file) => {
    const form = new FormData();
    form.append('schedule', file);
    return request('/schedule/upload', { method: 'POST', body: form });
  },

  getDashboard: () => request('/dashboard'),
  deleteSchedule: () => request('/schedule', { method: 'DELETE' }),

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
};
