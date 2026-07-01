class InterviewQuestion:
    def __init__(self, 
                    topic: str,
                    question_id: str, 
                    question: str):
        self.topic = topic
        self.question_id = question_id
        self.question = question
        self.notes: list[str] = []
        self.note_privacy_signals: list[dict] = []
        self.sub_questions: list['InterviewQuestion'] = []
        
    def serialize(self):
        return {
            "topic": self.topic,
            "question_id": self.question_id,
            "question": self.question,
            "notes": self.notes,
            "note_privacy_signals": self.note_privacy_signals,
            "sub_questions": [sq.serialize() for sq in self.sub_questions]
        }
