export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizItem {
  id: string;
  stem: string;
  /** 题型标识。具体枚举在实现期再收敛，脚手架不预设题型规则。 */
  type: string;
  options: QuizOption[];
  /** 是否来自错题本。入卷占比不得超过 WRONG_QUESTION_RATIO_MAX。 */
  fromWrongBook: boolean;
}

/** 卷结构占位。题目按需生成，不是静态题库。 */
export interface QuizPaper {
  id: string;
  items: QuizItem[];
}

export interface QuizSession {
  id: string;
  userId: string;
  paper?: QuizPaper;
}

export interface GenerateQuizJobPayload {
  userId: string;
  sessionId: string;
}
