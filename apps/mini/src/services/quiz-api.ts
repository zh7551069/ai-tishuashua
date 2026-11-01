import type {
  CreateQuizSessionRequest,
  QuizAnswerResult,
  QuizScoreList,
  QuizSessionView,
  SaveQuizAnswerRequest,
  SubmitQuizRequest,
} from '@tishuashua/shared';
import { apiRequest } from './http';

export function createQuizSession(
  token: string,
  input: CreateQuizSessionRequest,
): Promise<QuizSessionView> {
  return apiRequest<QuizSessionView>('/quiz/sessions', { method: 'POST', token, data: input });
}

export function fetchQuizScores(token: string): Promise<QuizScoreList> {
  return apiRequest<QuizScoreList>('/quiz/sessions', { method: 'GET', token });
}

export function fetchQuizSession(token: string, sessionId: string): Promise<QuizSessionView> {
  return apiRequest<QuizSessionView>(`/quiz/sessions/${sessionId}`, { method: 'GET', token });
}

export function cancelQuizSession(token: string, sessionId: string): Promise<QuizSessionView> {
  return apiRequest<QuizSessionView>(`/quiz/sessions/${sessionId}/cancel`, {
    method: 'POST',
    token,
  });
}

export function startQuizSession(token: string, sessionId: string): Promise<QuizSessionView> {
  return apiRequest<QuizSessionView>(`/quiz/sessions/${sessionId}/start`, {
    method: 'POST',
    token,
  });
}

export function saveQuizAnswer(
  token: string,
  sessionId: string,
  input: SaveQuizAnswerRequest,
): Promise<QuizAnswerResult> {
  return apiRequest<QuizAnswerResult>(`/quiz/sessions/${sessionId}/answers`, {
    method: 'POST',
    token,
    data: input,
  });
}

export function submitQuizSession(
  token: string,
  sessionId: string,
  input: SubmitQuizRequest = {},
): Promise<QuizSessionView> {
  return apiRequest<QuizSessionView>(`/quiz/sessions/${sessionId}/submit`, {
    method: 'POST',
    token,
    data: input,
  });
}
