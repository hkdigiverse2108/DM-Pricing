from alembic import context
from app.config import settings
from app.database import Base
from app import models  # noqa: F401  (register tables)
from sqlalchemy import create_engine

target_metadata = Base.metadata

def run_migrations_online():
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()

run_migrations_online()
