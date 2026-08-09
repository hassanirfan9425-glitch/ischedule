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

  getManualExams: () => request('/manual-exams'),
  addManualExam: (exam) => request('/manual-exams', { method: 'POST', body: JSON.stringify(exam) }),
  deleteManualExam: (id) => request(`/manual-exams/${id}`, { method: 'DELETE' }),
  finishManualEntry: () => request('/manual-exams/finish', { method: 'POST' }),
};
