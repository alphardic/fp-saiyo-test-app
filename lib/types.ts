export const FIELDS = [
  "為替市場",
  "金利市場",
  "株式投資",
  "投資信託",
  "債券",
  "居住用不動産",
  "投資用不動産",
  "保険",
] as const;

export type Field = (typeof FIELDS)[number];

export type QuestionType = "選択式" | "記述式";

export interface Question {
  id: string;
  field: Field;
  type: QuestionType;
  question: string;
  choices: string[] | null;
  answer: string;
  explanation: string;
  status: "draft" | "approved" | "retired";
}

// 候補者に返す用(正解・解説を含まない)
export interface QuestionForCandidate {
  id: string;
  field: Field;
  type: QuestionType;
  question: string;
  choices: string[] | null;
}

export interface ExamSession {
  id: string;
  candidate_id: string;
  status: "not_started" | "in_progress" | "submitted" | "graded";
  question_ids: string[];
}