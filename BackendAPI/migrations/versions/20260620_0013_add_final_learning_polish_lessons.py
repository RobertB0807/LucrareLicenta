"""add final learning polish lessons

Revision ID: 20260620_0013
Revises: 20260619_0012
Create Date: 2026-06-20 12:00:00
"""

from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "20260620_0013"
down_revision = "20260619_0012"
branch_labels = None
depends_on = None


LESSONS = (
    {
        "id": "safe-link-checking",
        "category": "Escrocherii web",
        "title": "Verificarea sigură a linkurilor",
        "summary": "Învață să citești domenii, subdomenii, linkuri scurtate și pagini mobile înainte să introduci date.",
        "duration_minutes": 7,
        "level": "intermediate",
        "attack_type": "phishing",
        "difficulty": "medium",
        "pass_score": 75,
        "xp_reward": 30,
        "order_index": 14,
        "is_active": True,
    },
    {
        "id": "workplace-impersonation",
        "category": "Vishing",
        "title": "Impersonare la locul de muncă",
        "summary": "Validează cereri urgente de plată, acces sau date sensibile când atacatorul pretinde că este coleg, manager ori furnizor.",
        "duration_minutes": 9,
        "level": "advanced",
        "attack_type": "impersonation",
        "difficulty": "hard",
        "pass_score": 80,
        "xp_reward": 35,
        "order_index": 15,
        "is_active": True,
    },
    {
        "id": "incident-response-basics",
        "category": "Fundamente",
        "title": "Ce faci după o greșeală",
        "summary": "Pași rapizi după click, date introduse, atașament deschis sau cod de autentificare comunicat.",
        "duration_minutes": 8,
        "level": "advanced",
        "attack_type": None,
        "difficulty": "hard",
        "pass_score": 80,
        "xp_reward": 35,
        "order_index": 16,
        "is_active": True,
    },
)


SECTIONS = {
    "safe-link-checking": (
        (
            "Domeniul real",
            "Citește adresa de la dreapta la stânga: domeniul principal este înaintea extensiei, nu în subdomeniu. De exemplu, login.banca.example.invalid nu aparține băncii dacă domeniul real este example.invalid.",
        ),
        (
            "Linkuri scurtate și redirectări",
            "Un link scurt ascunde destinația. Dacă mesajul cere autentificare, plată sau date personale, nu folosi linkul primit. Deschide manual aplicația sau site-ul oficial.",
        ),
        (
            "Semnale înainte de login",
            "Managerul de parole care nu completează automat, certificatul emis pentru alt domeniu sau limba nefirească sunt motive să oprești acțiunea și să verifici separat.",
        ),
    ),
    "workplace-impersonation": (
        (
            "Autoritate falsă",
            "Atacatorii pot folosi numele unui manager, furnizor sau coleg și pot invoca urgență. Scopul este să sari peste procedura normală pentru plăți, acces sau date confidențiale.",
        ),
        (
            "Verificare în doi pași",
            "Confirmă cererile sensibile printr-un canal separat și cunoscut: apel intern, tichet, flux de aprobare sau confirmare în sistemul oficial. Nu folosi contactele oferite în mesajul suspect.",
        ),
        (
            "Limite clare",
            "Nu trimite parole, coduri MFA, liste de clienți sau documente interne prin chat ori email la cerere urgentă. O solicitare legitimă poate aștepta verificarea corectă.",
        ),
    ),
    "incident-response-basics": (
        (
            "Primele minute",
            "Oprește interacțiunea, notează ce s-a întâmplat și raportează rapid. Nu încerca să repari în tăcere; timpul pierdut poate crește impactul.",
        ),
        (
            "Date sau coduri expuse",
            "Schimbă parola din canalul oficial, revocă sesiunile active necunoscute și anunță banca sau echipa IT dacă au fost expuse date financiare ori coduri de autentificare.",
        ),
        (
            "Dovezi utile",
            "Păstrează mesajul, linkul, ora, capturi relevante și acțiunile făcute. Nu accesa din nou linkul pentru capturi suplimentare dacă nu ți se cere explicit de echipa responsabilă.",
        ),
    ),
}


QUESTIONS = (
    (
        "safe-link-checking",
        "Cum identifici domeniul real al unui link?",
        "Domeniul principal este partea registrabilă de dinaintea extensiei, nu textul pus în subdomeniu.",
        ("Mă uit doar la primul cuvânt", "Citesc domeniul principal înaintea extensiei", "Verific doar culoarea paginii"),
        1,
    ),
    (
        "safe-link-checking",
        "Ce faci cu un link scurt care cere autentificare?",
        "Linkurile scurtate nu sunt potrivite pentru autentificare sau plăți; folosește canalul oficial.",
        ("Îl deschid rapid", "Deschid manual aplicația sau site-ul oficial", "Îl trimit mai departe"),
        1,
    ),
    (
        "safe-link-checking",
        "Ce semnal poate indica un domeniu fals?",
        "Managerul de parole nu completează datele când domeniul nu este cel salvat.",
        ("Managerul de parole nu completează automat", "Pagina are un buton albastru", "Mesajul este scurt"),
        0,
    ),
    (
        "workplace-impersonation",
        "Cum validezi o cerere urgentă de plată de la un presupus manager?",
        "Cererile financiare trebuie confirmate prin procedura oficială și un canal independent.",
        ("Execut imediat", "Confirm prin canal separat și flux oficial", "Răspund cu datele cardului"),
        1,
    ),
    (
        "workplace-impersonation",
        "Ce contact folosești pentru verificare?",
        "Contactele din mesajul suspect pot fi controlate de atacator.",
        ("Numărul din mesajul suspect", "Canalul intern cunoscut", "Linkul de chat primit"),
        1,
    ),
    (
        "workplace-impersonation",
        "Ce informație nu trimiți la cerere urgentă pe chat?",
        "Codurile MFA și parolele sunt secrete, indiferent de identitatea pretinsă a solicitantului.",
        ("Cod MFA sau parolă", "Programul public al biroului", "Adresa sediului public"),
        0,
    ),
    (
        "incident-response-basics",
        "Care este prima reacție după ce ai apăsat un link suspect?",
        "Raportarea rapidă și oprirea interacțiunii reduc impactul.",
        ("Continui ca să văd ce se întâmplă", "Oprești interacțiunea și raportezi", "Ștergi mesajul fără să spui nimic"),
        1,
    ),
    (
        "incident-response-basics",
        "Ce faci dacă ai comunicat un cod de autentificare?",
        "Codul poate permite accesul atacatorului, deci trebuie revocate sesiuni și schimbată parola.",
        ("Revoci sesiunile și schimbi parola din canal oficial", "Aștepți următoarea zi", "Trimiți încă un cod"),
        0,
    ),
    (
        "incident-response-basics",
        "Ce dovadă este utilă pentru raportare?",
        "Mesajul original, ora și acțiunile făcute ajută la investigare.",
        ("Mesajul original și ora primirii", "Doar memoria ta", "Un link reaccesat de mai multe ori"),
        0,
    ),
)


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    lesson_table = sa.table(
        "learning_lessons",
        sa.column("id"),
        sa.column("category"),
        sa.column("title"),
        sa.column("summary"),
        sa.column("duration_minutes"),
        sa.column("level"),
        sa.column("attack_type"),
        sa.column("difficulty"),
        sa.column("pass_score"),
        sa.column("xp_reward"),
        sa.column("order_index"),
        sa.column("is_active"),
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
    op.bulk_insert(
        section_table,
        [
            {
                "id": f"{lesson_id}-section-{index}",
                "lesson_id": lesson_id,
                "title": title,
                "body": body,
                "order_index": index,
            }
            for lesson_id, sections in SECTIONS.items()
            for index, (title, body) in enumerate(sections, start=1)
        ],
    )

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
    per_lesson_index: dict[str, int] = {}
    for lesson_id, prompt, explanation, options, correct_index in QUESTIONS:
        question_index = per_lesson_index.get(lesson_id, 0) + 1
        per_lesson_index[lesson_id] = question_index
        question_id = f"{lesson_id}-q{question_index}"
        question_rows.append(
            {
                "id": question_id,
                "lesson_id": lesson_id,
                "prompt": prompt,
                "explanation": explanation,
                "order_index": question_index,
            }
        )
        for option_index, option_text in enumerate(options, start=1):
            option_rows.append(
                {
                    "id": f"{question_id}-o{option_index}",
                    "question_id": question_id,
                    "text": option_text,
                    "is_correct": option_index - 1 == correct_index,
                    "order_index": option_index,
                }
            )

    op.bulk_insert(question_table, question_rows)
    op.bulk_insert(option_table, option_rows)


def downgrade() -> None:
    quoted_ids = ", ".join(f"'{lesson['id']}'" for lesson in LESSONS)
    op.execute(f"DELETE FROM learning_lessons WHERE id IN ({quoted_ids})")
