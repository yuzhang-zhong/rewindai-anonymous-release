export interface Message {
  id: string;
  content: string;
  created_at: string;
  role: 'Interviewer' | 'User';
} 