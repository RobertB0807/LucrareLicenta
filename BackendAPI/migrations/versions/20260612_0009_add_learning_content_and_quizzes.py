"""add persisted learning content and quizzes

Revision ID: 20260612_0009
Revises: 20260609_0008
Create Date: 2026-06-12 19:00:00
"""

from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "20260612_0009"
down_revision = "20260609_0008"
branch_labels = None
depends_on = None


LESSONS = (
    {
        "id": "phishing-101",
        "category": "Fundamente",
        "title": "Phishing 101: cum gândesc atacatorii",
        "summary": "Înțelege psihologia din spatele phishing-ului: urgență, autoritate și curiozitate.",
        "duration_minutes": 4,
        "level": "beginner",
        "attack_type": "phishing",
        "difficulty": "easy",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 1,
        "is_active": True,
    },
    {
        "id": "email-red-flags",
        "category": "Phishing",
        "title": "Cum observi red flags în email",
        "summary": "Domenii asemănătoare, expeditori nepotriviți, urgență și atașamente neașteptate.",
        "duration_minutes": 5,
        "level": "beginner",
        "attack_type": "phishing",
        "difficulty": "easy",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 2,
        "is_active": True,
    },
    {
        "id": "smishing-deep-dive",
        "category": "Smishing",
        "title": "Escrocherii SMS și alerte false de livrare",
        "summary": "Învață de ce mesajele scurte par credibile și cum verifici o alertă fără linkul primit.",
        "duration_minutes": 4,
        "level": "beginner",
        "attack_type": "smishing",
        "difficulty": "easy",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 3,
        "is_active": True,
    },
    {
        "id": "vishing-callbacks",
        "category": "Vishing",
        "title": "Fraude vocale și apeluri deepfake",
        "summary": "Recunoaște presiunea din apeluri și verifică identitatea printr-un canal separat.",
        "duration_minutes": 6,
        "level": "intermediate",
        "attack_type": "impersonation",
        "difficulty": "medium",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 4,
        "is_active": True,
    },
    {
        "id": "fake-websites",
        "category": "Escrocherii web",
        "title": "Pagini false de login și typosquatting",
        "summary": "Analizează domenii, subdomenii și pagini false de autentificare.",
        "duration_minutes": 5,
        "level": "intermediate",
        "attack_type": "phishing",
        "difficulty": "medium",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 5,
        "is_active": True,
    },
    {
        "id": "mfa-passwords",
        "category": "Siguranța contului",
        "title": "MFA, passkeys și igiena parolelor",
        "summary": "Protejează conturile cu parole unice, MFA rezistent la phishing și passkeys.",
        "duration_minutes": 5,
        "level": "intermediate",
        "attack_type": None,
        "difficulty": "medium",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 6,
        "is_active": True,
    },
    {
        "id": "social-engineering-advanced",
        "category": "Fundamente",
        "title": "Social engineering avansat",
        "summary": "Studiază spear-phishing, pretexting și compromiterea emailului de business.",
        "duration_minutes": 7,
        "level": "advanced",
        "attack_type": "impersonation",
        "difficulty": "hard",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 7,
        "is_active": True,
    },
)

SECTIONS = (
    ("phishing-101", "Psihologia atacului", "Atacatorii folosesc urgența, autoritatea și curiozitatea pentru a reduce timpul acordat verificării.", "Oprește reacția automată și verifică solicitarea printr-un canal oficial separat."),
    ("email-red-flags", "Verificarea expeditorului", "Numele afișat poate fi falsificat. Verifică domeniul complet, răspunsul real și contextul solicitării.", "Nu deschide atașamente neașteptate și accesează contul direct din aplicația oficială."),
    ("smishing-deep-dive", "De ce funcționează SMS-ul", "Mesajele scurte ascund contextul și folosesc notificări de livrare, amenzi sau blocări pentru a crea grabă.", "Nu folosi linkul primit. Verifică situația în aplicația oficială sau la numărul public al instituției."),
    ("vishing-callbacks", "Controlul conversației", "Un apelant poate falsifica numărul și poate folosi informații publice pentru credibilitate.", "Închide apelul și sună la un număr oficial. Nu comunica parole, coduri MFA sau date bancare."),
    ("fake-websites", "Citirea corectă a URL-ului", "Domeniul registrabil se citește înaintea extensiei; subdomeniile pot include numele unei organizații fără a-i aparține.", "Deschide manual site-ul oficial și folosește managerul de parole ca semnal suplimentar de verificare."),
    ("mfa-passwords", "Apărare în profunzime", "Parolele unice limitează reutilizarea credentialelor, iar passkeys reduc riscul de phishing.", "Nu aproba notificări MFA neașteptate și nu comunica niciodată coduri de autentificare."),
    ("social-engineering-advanced", "Pretexte credibile", "Atacurile avansate folosesc procese reale, relații profesionale și conversații compromise.", "Aplică verificări procedurale pentru schimbări de plată, acces sau date sensibile, indiferent de aparenta autoritate."),
)

QUESTIONS = (
    ("phishing-101", "Ce acțiune reduce cel mai mult efectul urgenței artificiale?", "Verificarea separată întrerupe presiunea creată de atacator.", ("Răspund imediat pentru a evita blocarea", "Verific solicitarea prin canalul oficial", "Redirecționez mesajul tuturor colegilor"), 1),
    ("phishing-101", "Ce informație trebuie verificată la un email suspect?", "Domeniul complet oferă un semnal mai bun decât numele afișat.", ("Doar logo-ul", "Doar numele afișat", "Domeniul complet al expeditorului"), 2),
    ("email-red-flags", "Care este cel mai sigur mod de a accesa un cont menționat într-un email?", "Navigarea separată evită linkul controlat de atacator.", ("Din linkul emailului", "Din aplicația sau site-ul deschis manual", "Din primul rezultat sponsorizat"), 1),
    ("email-red-flags", "Ce faci cu un atașament neașteptat?", "Atașamentele neașteptate trebuie validate înainte de deschidere.", ("Îl deschid în grabă", "Îl validez cu expeditorul prin alt canal", "Activez macro-urile cerute"), 1),
    ("smishing-deep-dive", "Cum verifici o alertă de livrare primită prin SMS?", "Aplicația oficială oferă context fără a folosi linkul primit.", ("Accesez linkul scurt", "Verific direct în aplicația curierului", "Trimit datele cardului prin SMS"), 1),
    ("smishing-deep-dive", "Ce semnal este frecvent în smishing?", "Presiunea și linkurile scurte sunt folosite pentru a grăbi victima.", ("Mesaj fără nicio acțiune", "Urgență și link scurt", "Confirmare în aplicația oficială"), 1),
    ("vishing-callbacks", "Cum validezi un apelant care pretinde că este de la bancă?", "Reapelarea la numărul public rupe controlul atacatorului asupra canalului.", ("Continui apelul", "Sun înapoi la numărul oficial", "Comunic un cod MFA"), 1),
    ("vishing-callbacks", "Ce informație nu trebuie comunicată la telefon?", "Codurile MFA sunt secrete și nu sunt solicitate legitim de operatori.", ("Programul sucursalei", "Codul MFA", "Numărul public al băncii"), 1),
    ("fake-websites", "Ce parte a adresei indică proprietarul real al site-ului?", "Domeniul registrabil înaintea extensiei este elementul relevant.", ("Textul dinaintea primului punct", "Domeniul registrabil înaintea extensiei", "Titlul paginii"), 1),
    ("fake-websites", "Ce faci când managerul de parole nu completează datele pe o pagină aparent cunoscută?", "Lipsa completării poate indica un domeniu diferit și cere verificare.", ("Introduc manual parola", "Verific domeniul și deschid site-ul oficial", "Dezactivez managerul"), 1),
    ("mfa-passwords", "Care metodă este mai rezistentă la phishing?", "Passkeys sunt legate criptografic de domeniul legitim.", ("Aceeași parolă peste tot", "Passkey", "Cod trimis unui necunoscut"), 1),
    ("mfa-passwords", "Cum reacționezi la notificări MFA neașteptate?", "Respingerea și schimbarea parolei limitează o tentativă de acces.", ("Le aprob până dispar", "Le resping și verific securitatea contului", "Trimit codul prin chat"), 1),
    ("social-engineering-advanced", "Cum verifici o schimbare urgentă de cont bancar cerută de un manager?", "Procedura independentă este necesară chiar când cererea pare internă.", ("Execut imediat", "Confirm prin procedura oficială și alt canal", "Răspund cu datele clientului"), 1),
    ("social-engineering-advanced", "Ce face spear-phishing-ul mai credibil?", "Personalizarea folosește informații și procese relevante pentru țintă.", ("Lipsa oricărui context", "Personalizarea cu informații relevante", "Doar greșelile gramaticale"), 1),
)


def upgrade() -> None:
    op.create_table(
        "learning_lessons",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("attack_type", sa.String(length=32), nullable=True),
        sa.Column("difficulty", sa.String(length=16), nullable=False),
        sa.Column("pass_score", sa.Integer(), nullable=False, server_default="70"),
        sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="25"),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_learning_lessons_category", "learning_lessons", ["category"])
    op.create_index("ix_learning_lessons_level", "learning_lessons", ["level"])
    op.create_index("ix_learning_lessons_order_index", "learning_lessons", ["order_index"])
    op.create_index("ix_learning_lessons_is_active", "learning_lessons", ["is_active"])

    op.create_table(
        "learning_lesson_sections",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("lesson_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["learning_lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_id", "order_index", name="uq_learning_lesson_sections_lesson_order"),
    )
    op.create_index("ix_learning_lesson_sections_lesson_id", "learning_lesson_sections", ["lesson_id"])

    op.create_table(
        "learning_quiz_questions",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("lesson_id", sa.String(length=128), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["learning_lessons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_id", "order_index", name="uq_learning_quiz_questions_lesson_order"),
    )
    op.create_index("ix_learning_quiz_questions_lesson_id", "learning_quiz_questions", ["lesson_id"])

    op.create_table(
        "learning_quiz_options",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("question_id", sa.String(length=128), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["learning_quiz_questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("question_id", "order_index", name="uq_learning_quiz_options_question_order"),
    )
    op.create_index("ix_learning_quiz_options_question_id", "learning_quiz_options", ["question_id"])

    op.create_table(
        "learning_quiz_attempts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("lesson_id", sa.String(length=128), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("correct_answers", sa.Integer(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("xp_awarded", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["learning_lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_learning_quiz_attempts_user_id", "learning_quiz_attempts", ["user_id"])
    op.create_index("ix_learning_quiz_attempts_lesson_id", "learning_quiz_attempts", ["lesson_id"])
    op.create_index("ix_learning_quiz_attempts_passed", "learning_quiz_attempts", ["passed"])
    op.create_index("ix_learning_quiz_attempts_created_at", "learning_quiz_attempts", ["created_at"])

    op.create_table(
        "learning_quiz_answers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("attempt_id", sa.String(length=64), nullable=False),
        sa.Column("question_id", sa.String(length=128), nullable=False),
        sa.Column("selected_option_id", sa.String(length=128), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["attempt_id"], ["learning_quiz_attempts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["learning_quiz_questions.id"]),
        sa.ForeignKeyConstraint(["selected_option_id"], ["learning_quiz_options.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_id", "question_id", name="uq_learning_quiz_answers_attempt_question"),
    )
    op.create_index("ix_learning_quiz_answers_attempt_id", "learning_quiz_answers", ["attempt_id"])
    op.create_index("ix_learning_quiz_answers_question_id", "learning_quiz_answers", ["question_id"])

    now = datetime.now(timezone.utc)
    lesson_table = sa.table(
        "learning_lessons",
        *(sa.column(name) for name in LESSONS[0]),
        sa.column("created_at"),
        sa.column("updated_at"),
    )
    op.bulk_insert(
        lesson_table,
        [{**lesson, "created_at": now, "updated_at": now} for lesson in LESSONS],
    )

    section_table = sa.table(
        "learning_lesson_sections",
        sa.column("id"),
        sa.column("lesson_id"),
        sa.column("title"),
        sa.column("body"),
        sa.column("order_index"),
    )
    section_rows = []
    for lesson_id, first_title, first_body, second_body in SECTIONS:
        section_rows.extend(
            (
                {
                    "id": f"{lesson_id}-section-1",
                    "lesson_id": lesson_id,
                    "title": first_title,
                    "body": first_body,
                    "order_index": 1,
                },
                {
                    "id": f"{lesson_id}-section-2",
                    "lesson_id": lesson_id,
                    "title": "Acțiune defensivă",
                    "body": second_body,
                    "order_index": 2,
                },
            )
        )
    op.bulk_insert(section_table, section_rows)

    question_table = sa.table(
        "learning_quiz_questions",
        sa.column("id"),
        sa.column("lesson_id"),
        sa.column("prompt"),
        sa.column("explanation"),
        sa.column("order_index"),
    )
    option_table = sa.table(
        "learning_quiz_options",
        sa.column("id"),
        sa.column("question_id"),
        sa.column("text"),
        sa.column("is_correct"),
        sa.column("order_index"),
    )
    question_rows = []
    option_rows = []
    question_counts: dict[str, int] = {}
    for lesson_id, prompt, explanation, options, correct_index in QUESTIONS:
        question_counts[lesson_id] = question_counts.get(lesson_id, 0) + 1
        order_index = question_counts[lesson_id]
        question_id = f"{lesson_id}-q{order_index}"
        question_rows.append(
            {
                "id": question_id,
                "lesson_id": lesson_id,
                "prompt": prompt,
                "explanation": explanation,
                "order_index": order_index,
            }
        )
        option_rows.extend(
            {
                "id": f"{question_id}-o{option_index + 1}",
                "question_id": question_id,
                "text": option_text,
                "is_correct": option_index == correct_index,
                "order_index": option_index + 1,
            }
            for option_index, option_text in enumerate(options)
        )
    op.bulk_insert(question_table, question_rows)
    op.bulk_insert(option_table, option_rows)


def downgrade() -> None:
    op.drop_index("ix_learning_quiz_answers_question_id", table_name="learning_quiz_answers")
    op.drop_index("ix_learning_quiz_answers_attempt_id", table_name="learning_quiz_answers")
    op.drop_table("learning_quiz_answers")
    op.drop_index("ix_learning_quiz_attempts_created_at", table_name="learning_quiz_attempts")
    op.drop_index("ix_learning_quiz_attempts_passed", table_name="learning_quiz_attempts")
    op.drop_index("ix_learning_quiz_attempts_lesson_id", table_name="learning_quiz_attempts")
    op.drop_index("ix_learning_quiz_attempts_user_id", table_name="learning_quiz_attempts")
    op.drop_table("learning_quiz_attempts")
    op.drop_index("ix_learning_quiz_options_question_id", table_name="learning_quiz_options")
    op.drop_table("learning_quiz_options")
    op.drop_index("ix_learning_quiz_questions_lesson_id", table_name="learning_quiz_questions")
    op.drop_table("learning_quiz_questions")
    op.drop_index("ix_learning_lesson_sections_lesson_id", table_name="learning_lesson_sections")
    op.drop_table("learning_lesson_sections")
    op.drop_index("ix_learning_lessons_is_active", table_name="learning_lessons")
    op.drop_index("ix_learning_lessons_order_index", table_name="learning_lessons")
    op.drop_index("ix_learning_lessons_level", table_name="learning_lessons")
    op.drop_index("ix_learning_lessons_category", table_name="learning_lessons")
    op.drop_table("learning_lessons")
