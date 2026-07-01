"""add personalized learning lessons

Revision ID: 20260619_0012
Revises: 20260614_0011
Create Date: 2026-06-19 12:00:00
"""

from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "20260619_0012"
down_revision = "20260614_0011"
branch_labels = None
depends_on = None


LESSONS = (
    {
        "id": "reporting-basics",
        "category": "Fundamente",
        "title": "Cum raportezi un mesaj suspect",
        "summary": "Învață ce păstrezi, ce nu atingi și cum raportezi rapid un posibil atac.",
        "duration_minutes": 6,
        "level": "beginner",
        "attack_type": "phishing",
        "difficulty": "easy",
        "pass_score": 70,
        "xp_reward": 25,
        "order_index": 8,
        "is_active": True,
    },
    {
        "id": "phishing-attachments",
        "category": "Phishing",
        "title": "Atașamente, macro-uri și documente false",
        "summary": "Recunoaște documentele care cer acțiuni riscante și verifică expeditorul înainte de deschidere.",
        "duration_minutes": 8,
        "level": "intermediate",
        "attack_type": "phishing",
        "difficulty": "medium",
        "pass_score": 75,
        "xp_reward": 30,
        "order_index": 9,
        "is_active": True,
    },
    {
        "id": "banking-smishing",
        "category": "Smishing",
        "title": "Alerte bancare false prin SMS",
        "summary": "Separă notificările legitime de mesajele care cer carduri, coduri sau autentificare prin link.",
        "duration_minutes": 7,
        "level": "intermediate",
        "attack_type": "smishing",
        "difficulty": "medium",
        "pass_score": 75,
        "xp_reward": 30,
        "order_index": 10,
        "is_active": True,
    },
    {
        "id": "it-support-vishing",
        "category": "Vishing",
        "title": "Apeluri false de la suport IT",
        "summary": "Identifică pretextele de suport tehnic și refuză instalarea aplicațiilor de control remote.",
        "duration_minutes": 8,
        "level": "intermediate",
        "attack_type": "impersonation",
        "difficulty": "medium",
        "pass_score": 75,
        "xp_reward": 30,
        "order_index": 11,
        "is_active": True,
    },
    {
        "id": "qr-phishing",
        "category": "Escrocherii web",
        "title": "QR phishing și pagini mobile false",
        "summary": "Verifică linkurile ascunse în coduri QR, afișe, emailuri și documente.",
        "duration_minutes": 7,
        "level": "intermediate",
        "attack_type": "phishing",
        "difficulty": "medium",
        "pass_score": 75,
        "xp_reward": 30,
        "order_index": 12,
        "is_active": True,
    },
    {
        "id": "account-recovery-abuse",
        "category": "Siguranța contului",
        "title": "Abuzul proceselor de recuperare cont",
        "summary": "Protejează codurile de recuperare, sesiunile active și resetările de parolă inițiate de atacatori.",
        "duration_minutes": 9,
        "level": "advanced",
        "attack_type": "impersonation",
        "difficulty": "hard",
        "pass_score": 80,
        "xp_reward": 35,
        "order_index": 13,
        "is_active": True,
    },
)


SECTIONS = {
    "reporting-basics": (
        (
            "Când raportezi",
            "Raportează când mesajul cere login, plată, coduri MFA, date personale sau deschiderea unui atașament neașteptat. Nu trebuie să fii sigur că este atac; este suficient să observi semnale de risc.",
        ),
        (
            "Ce păstrezi",
            "Păstrează mesajul original, expeditorul, ora primirii și contextul. Nu accesa linkuri pentru a strânge dovezi suplimentare. Dacă ai interacționat deja, notează ce date ai introdus.",
        ),
        (
            "Răspuns corect",
            "Folosește butonul de raportare, marchează SMS-ul ca spam sau contactează canalul oficial. Nu redirecționa mesajul către colegi fără avertisment și nu răspunde atacatorului.",
        ),
    ),
    "phishing-attachments": (
        (
            "Documente cu pretext",
            "Atașamentele false folosesc facturi, contracte, CV-uri sau documente partajate. Riscul crește când fișierul cere macro-uri, parolă, login sau instalarea unei componente.",
        ),
        (
            "Verificare înainte de deschidere",
            "Confirmă prin alt canal că documentul era așteptat. Verifică domeniul expeditorului și motivul trimiterii. Dacă documentul cere activarea macro-urilor, tratează-l ca risc ridicat.",
        ),
        (
            "După o deschidere accidentală",
            "Închide fișierul, deconectează-te de la rețele sensibile dacă procedura internă o cere și raportează imediat. Cu cât raportarea este mai rapidă, cu atât impactul poate fi limitat.",
        ),
    ),
    "banking-smishing": (
        (
            "Mesajul bancar fals",
            "Atacatorii folosesc texte despre card blocat, tranzacție suspectă sau actualizare obligatorie. Linkul duce către o pagină care colectează cardul, parola sau codul de confirmare.",
        ),
        (
            "Canalul sigur",
            "Banca se verifică din aplicația oficială sau prin numărul public de pe card. Nu folosi linkul primit prin SMS și nu comunica niciodată coduri de autorizare.",
        ),
        (
            "Dacă ai introdus date",
            "Contactează banca imediat, blochează cardul dacă este cazul, schimbă parola și verifică tranzacțiile. Salvează mesajul pentru raportare.",
        ),
    ),
    "it-support-vishing": (
        (
            "Pretextul de suport",
            "Un fals tehnician poate spune că dispozitivul tău este compromis sau că trebuie verificat urgent. Scopul este să obțină parole, coduri sau acces remote.",
        ),
        (
            "Control remote",
            "Nu instala aplicații dictate într-un apel neașteptat. Accesul remote permite atacatorului să vadă ecranul, să copieze date sau să autorizeze operațiuni în numele tău.",
        ),
        (
            "Validare internă",
            "Închide apelul și deschide un tichet sau contactează suportul prin canalul cunoscut. O echipă legitimă acceptă verificarea independentă.",
        ),
    ),
    "qr-phishing": (
        (
            "De ce QR-ul ascunde riscul",
            "Un cod QR poate ascunde o adresă web lungă și greu de inspectat pe mobil. Atacatorii îl folosesc pe afișe, emailuri, documente sau false notificări de plată.",
        ),
        (
            "Verificare pe mobil",
            "Previzualizează adresa înainte de deschidere. Dacă domeniul nu este clar, intră manual în site-ul oficial sau folosește aplicația legitimă.",
        ),
        (
            "Contextul contează",
            "Un QR lipit peste un afiș, primit într-un email urgent sau asociat unei plăți neașteptate trebuie tratat ca suspect. Nu introduce date de login sau card fără verificare.",
        ),
    ),
    "account-recovery-abuse": (
        (
            "Resetări inițiate de atacator",
            "Un atacator poate porni recuperarea contului și te poate convinge să trimiți codul primit. Codul este echivalent cu accesul la cont și nu trebuie comunicat.",
        ),
        (
            "Coduri de recuperare",
            "Codurile de backup trebuie păstrate separat și nu se trimit prin chat, telefon sau email. Dacă un cod a fost expus, generează unul nou și revocă-l pe cel vechi.",
        ),
        (
            "Revizuirea sesiunilor",
            "După orice suspiciune, schimbă parola din site-ul oficial, revocă sesiunile active necunoscute și verifică metodele de recuperare configurate în cont.",
        ),
    ),
}


QUESTIONS = (
    ("reporting-basics", "Când este potrivit să raportezi un mesaj?", "Raportarea este utilă chiar dacă nu ești complet sigur; semnalele de risc sunt suficiente.", ("Doar după ce ai apăsat linkul", "Când observi cereri suspecte sau presiune", "Niciodată, dacă mesajul are logo"), 1),
    ("reporting-basics", "Ce ar trebui să eviți când colectezi dovezi?", "Nu interacționa cu linkuri sau atașamente pentru a demonstra atacul.", ("Să păstrezi ora primirii", "Să accesezi linkul suspect", "Să păstrezi mesajul original"), 1),
    ("reporting-basics", "Care este un canal bun de raportare?", "Canalele controlate de organizație sau platformă reduc răspândirea mesajului.", ("Răspuns direct atacatorului", "Buton de raportare sau canal oficial", "Forward fără explicație către colegi"), 1),
    ("phishing-attachments", "Ce semnal face un atașament mai riscant?", "Macro-urile și instalările cerute de documente neașteptate sunt semnale puternice de risc.", ("Cere activarea macro-urilor", "Are un nume scurt", "A fost primit dimineața"), 0),
    ("phishing-attachments", "Cum verifici un document neașteptat?", "Confirmarea prin alt canal reduce riscul de a urma instrucțiunile atacatorului.", ("Îl deschizi și vezi ce conține", "Confirmi cu expeditorul prin alt canal", "Activezi conținutul pentru previzualizare"), 1),
    ("phishing-attachments", "Ce faci după ce ai deschis accidental un fișier suspect?", "Raportarea rapidă ajută la limitarea impactului.", ("Raportezi imediat și urmezi procedura", "Ștergi fișierul și ignori", "Îl trimiți tuturor pentru verificare"), 0),
    ("banking-smishing", "Cum verifici o alertă bancară prin SMS?", "Aplicația oficială și numărul public sunt canale independente.", ("Deschizi linkul primit", "Folosești aplicația oficială sau numărul de pe card", "Trimiți codul primit prin SMS"), 1),
    ("banking-smishing", "Ce informație nu se comunică niciodată prin SMS?", "Codurile de autorizare permit aprobarea operațiunilor.", ("Cod de autorizare", "Programul agenției", "Numele băncii"), 0),
    ("banking-smishing", "Ce faci dacă ai introdus cardul într-o pagină suspectă?", "Banca trebuie contactată rapid pentru blocare și monitorizare.", ("Aștepți să vezi ce se întâmplă", "Contactezi banca și verifici tranzacțiile", "Mai introduci o dată datele"), 1),
    ("it-support-vishing", "Ce cerere indică risc într-un apel de suport neașteptat?", "Aplicațiile remote pot oferi atacatorului control asupra dispozitivului.", ("Instalarea unei aplicații de control remote", "Deschiderea unui tichet oficial", "Programarea unei vizite"), 0),
    ("it-support-vishing", "Cum validezi suportul IT?", "Canalul cunoscut sau tichetul oficial rupe controlul apelantului.", ("Continui apelul până la final", "Deschizi tichet sau contactezi canalul oficial", "Trimiți parola temporară"), 1),
    ("it-support-vishing", "Ce atitudine este sigură când apelantul refuză verificarea?", "Refuzul verificării independente este un semnal de risc.", ("Închizi și raportezi", "Accepți ca să nu pierzi timp", "Îi dai codul MFA"), 0),
    ("qr-phishing", "Ce trebuie verificat înainte de a deschide un QR?", "Domeniul destinație contează mai mult decât locul unde apare codul.", ("Culoarea codului", "Domeniul afișat în previzualizare", "Dimensiunea afișului"), 1),
    ("qr-phishing", "Când este un QR mai suspect?", "Contextul urgent sau fizic modificat crește riscul.", ("Este lipit peste un afiș oficial", "Este în aplicația oficială", "Este generat de tine"), 0),
    ("qr-phishing", "Care este răspunsul sigur la un QR pentru plată neașteptată?", "Verificarea prin aplicația sau site-ul oficial evită domeniul fals.", ("Scanezi și plătești rapid", "Verifici separat în canalul oficial", "Introduci cardul ca test"), 1),
    ("account-recovery-abuse", "Ce înseamnă un cod de recuperare primit neașteptat?", "Poate indica o încercare de preluare a contului.", ("Îl trimiți celui care îl cere", "Îl tratezi ca semnal de risc", "Îl postezi pentru ajutor"), 1),
    ("account-recovery-abuse", "Unde păstrezi codurile de backup?", "Codurile trebuie păstrate într-un loc separat și controlat.", ("Într-un chat public", "Într-un loc sigur, separat", "În răspuns la emailuri de suport"), 1),
    ("account-recovery-abuse", "Ce verifici după o suspiciune de cont compromis?", "Sesiunile active și metodele de recuperare pot menține accesul atacatorului.", ("Doar poza de profil", "Sesiuni active și metode de recuperare", "Numărul de notificări"), 1),
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
    section_rows = [
        {
            "id": f"{lesson_id}-section-{index}",
            "lesson_id": lesson_id,
            "title": title,
            "body": body,
            "order_index": index,
        }
        for lesson_id, sections in SECTIONS.items()
        for index, (title, body) in enumerate(sections, start=1)
    ]
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
    lesson_ids = ", ".join(f"'{lesson['id']}'" for lesson in LESSONS)
    op.execute(sa.text(f"DELETE FROM learning_lessons WHERE id IN ({lesson_ids})"))
