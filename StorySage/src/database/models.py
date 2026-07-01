from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
import sqlalchemy

Base = declarative_base()

class DBSession(Base):
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True)
    seq_id = Column(Integer, nullable=False)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    messages = relationship("DBMessage", back_populates="session")
    user = relationship("DBUser", back_populates="sessions")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'seq_id', name='unique_user_session_seq'),
    )

class DBMessage(Base):
    __tablename__ = "messages"
    
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    content = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "User", "Interviewer", "Feedback"
    created_at = Column(DateTime, default=datetime.utcnow)
    
    session = relationship("DBSession", back_populates="messages") 

class DBUser(Base):
    __tablename__ = "users"
    
    user_id = Column(String, primary_key=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    sessions = relationship("DBSession", back_populates="user") 


class DBUserProfile(Base):
    __tablename__ = "user_profiles"

    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True)
    study_group = Column(String, nullable=False, default="experiment")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DBSimulationTrace(Base):
    __tablename__ = "simulation_traces"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    source = Column(String, nullable=False)
    session_id = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    received_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    decisions = Column(Integer, nullable=False, default=0)
    ended = Column(Boolean, nullable=False, default=False)
    contract_version = Column(String, nullable=True)
    payload = Column(JSON, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "source", "session_id", name="unique_user_trace_session"),
    )


class DBExperienceFeedback(Base):
    __tablename__ = "experience_feedback"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    study_group = Column(String, nullable=False, default="anonymous")
    rating = Column(Integer, nullable=True)
    feedback = Column(String, nullable=False)
    page_context = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DBDataCollectionEvent(Base):
    __tablename__ = "data_collection_events"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    study_group = Column(String, nullable=False, default="experiment")
    event_type = Column(String, nullable=False, index=True)
    data_category = Column(String, nullable=False, index=True)
    source = Column(String, nullable=True)
    session_id = Column(String, nullable=True)
    count = Column(Integer, nullable=False, default=1)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
