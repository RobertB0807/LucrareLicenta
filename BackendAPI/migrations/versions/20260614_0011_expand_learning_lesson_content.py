"""expand learning lesson content

Revision ID: 20260614_0011
Revises: 20260613_0010
Create Date: 2026-06-14 15:00:00
"""

from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "20260614_0011"
down_revision = "20260613_0010"
branch_labels = None
depends_on = None


LESSON_UPDATES = {
    "phishing-101": {
        "summary": "Învață cum atacatorii folosesc emoții, timp limitat și autoritate falsă pentru a obține click-uri, parole sau plăți.",
        "duration_minutes": 8,
        "sections": (
            (
                "Psihologia atacului",
                "Phishing-ul nu încearcă doar să pară tehnic credibil. El este construit ca o presiune psihologică: un mesaj scurt, o consecință aparent urgentă și o acțiune simplă pe care victima trebuie să o facă imediat.\n\nAtacatorii folosesc des trei declanșatori: frica de pierdere, respectul față de autoritate și curiozitatea. Un mesaj despre blocarea contului, o factură neașteptată sau un document „confidențial” este creat ca să reducă timpul de analiză.\n\n- Urgența cere reacție rapidă.\n- Autoritatea te face să eviți întrebările.\n- Curiozitatea te împinge să deschizi linkul sau atașamentul.",
            ),
            (
                "Cum oprești reacția automată",
                "Primul răspuns defensiv este pauza. Nu trebuie să demonstrezi rapid că ești atent; trebuie să verifici dacă cererea are sens în context. Întreabă-te cine cere acțiunea, de ce acum și ce se întâmplă dacă nu folosești linkul primit.\n\nO verificare bună mută conversația pe un canal controlat de tine: aplicația oficială, site-ul tastat manual, numărul public al instituției sau o discuție internă separată. Dacă mesajul era legitim, îl vei putea confirma și fără linkul din mesaj.",
            ),
            (
                "Exemplu practic",
                "Primești un email care spune că accesul la contul universitar expiră în 15 minute. Mesajul are logo, semnătură și un buton mare de autentificare. Semnalul important nu este doar cum arată emailul, ci combinația dintre termenul foarte scurt și cererea de login.\n\nRăspuns sigur: nu folosi butonul. Deschide separat portalul oficial al universității sau contactează suportul prin canalul cunoscut. Dacă nu există nicio alertă în contul oficial, tratează mesajul ca phishing.",
            ),
            (
                "Regulă de reținut",
                "Un mesaj legitim poate fi verificat fără să folosești linkul, atașamentul sau numărul primit în acel mesaj. Când cererea este urgentă, financiară sau cere date de autentificare, verificarea separată devine obligatorie.",
            ),
        ),
    },
    "email-red-flags": {
        "summary": "Învață să verifici expeditorul real, domeniul, atașamentele și presiunea dintr-un email înainte să interacționezi.",
        "duration_minutes": 9,
        "sections": (
            (
                "Verificarea expeditorului",
                "Numele afișat dintr-un email poate fi ales liber de atacator. Poți vedea „IT Support”, „Banca ta” sau numele unui coleg, chiar dacă adresa reală vine de pe un domeniu complet diferit.\n\nVerifică adresa completă, nu doar numele. Uită-te la domeniul de după `@`, la litere schimbate subtil și la extensii neașteptate. Diferențe precum `rn` în loc de `m`, cratime adăugate sau domenii foarte lungi sunt semnale comune.",
            ),
            (
                "Linkuri și atașamente",
                "Un link poate afișa un text familiar, dar destinația reală poate fi alta. Pe web poți verifica destinația înainte de click, iar pe mobil este mai sigur să nu folosești linkul și să intri direct în aplicația oficială.\n\nAtașamentele sunt riscante când nu au fost cerute. Facturi, arhive, documente cu macro-uri sau fișiere care cer autentificare suplimentară trebuie validate prin alt canal înainte de deschidere.",
            ),
            (
                "Red flags frecvente",
                "- Cerere urgentă de login, plată sau confirmare.\n- Salut generic în loc de context real.\n- Domeniu asemănător, dar nu identic cu cel oficial.\n- Atașament neașteptat sau parolat.\n- Greșeli de limbă combinate cu presiune de timp.\n- Amenințări cu suspendarea contului sau pierderea accesului.",
            ),
            (
                "Proces de verificare",
                "Folosește o rutină simplă: verifică expeditorul, verifică motivul, evită linkul, confirmă prin canal separat. Dacă mesajul pretinde că vine de la o organizație, intră manual în contul oficial. Dacă pare intern, contactează persoana printr-un canal deja cunoscut.\n\nNu redirecționa emailul suspect către alte persoane fără context. Într-un mediu profesional, folosește butonul de raportare sau trimite-l echipei de securitate conform procedurii.",
            ),
        ),
    },
    "smishing-deep-dive": {
        "summary": "Analizează mesajele SMS frauduloase, linkurile scurte, alertele de livrare și metodele sigure de verificare.",
        "duration_minutes": 8,
        "sections": (
            (
                "De ce funcționează SMS-ul",
                "Smishing-ul profită de faptul că mesajele SMS sunt scurte și par personale. Pe telefon vedem mai puțin context, linkurile sunt greu de inspectat, iar notificările apar într-un moment în care utilizatorul poate fi distras.\n\nAtacatorii aleg subiecte cotidiene: livrări, amenzi, rambursări, bănci, conturi blocate sau oferte limitate. Scopul este să te facă să atingi linkul înainte să întrebi dacă situația are sens.",
            ),
            (
                "Linkuri scurte și formulare false",
                "Un link scurt ascunde destinația reală. Chiar dacă pagina deschisă pare cunoscută, poate cere date bancare, coduri de confirmare sau autentificare într-un cont fals.\n\nNu introduce date personale sau carduri într-o pagină pornită din SMS. Pentru livrări, folosește aplicația curierului sau site-ul tastat manual. Pentru bancă, folosește aplicația oficială sau numărul public de pe card.",
            ),
            (
                "Exemple de semnale",
                "- Nu aștepți nicio livrare, dar primești taxă de colet.\n- Mesajul cere o sumă mică pentru a reduce suspiciunea.\n- Linkul este scurtat sau are domeniu necunoscut.\n- Se cere cardul pentru o confirmare care nu ar trebui să implice plată.\n- Mesajul creează frică: amendă, cont blocat, colet returnat.",
            ),
            (
                "Răspuns sigur",
                "Nu răspunde mesajului și nu folosi linkul. Fă captură dacă ai nevoie de dovadă, raportează SMS-ul ca spam și verifică separat în aplicația oficială. Dacă ai introdus date, acționează rapid: schimbă parola, contactează banca și urmărește tranzacțiile.",
            ),
        ),
    },
    "vishing-callbacks": {
        "summary": "Învață cum sunt construite apelurile de impersonare, inclusiv spoofing, presiune vocală și verificarea prin callback.",
        "duration_minutes": 9,
        "sections": (
            (
                "Controlul conversației",
                "În vishing, atacatorul controlează ritmul. Poate vorbi sigur pe el, poate pretinde că reprezintă banca, poliția, curierul sau departamentul IT și poate folosi informații publice pentru credibilitate.\n\nNumărul afișat nu este o dovadă suficientă. Spoofing-ul poate face ca apelul să pară venit de la o instituție reală. De aceea, identitatea trebuie verificată printr-un canal separat, inițiat de tine.",
            ),
            (
                "Ce nu se comunică niciodată",
                "Codurile MFA, parolele, PIN-ul cardului, codurile de recuperare și datele complete ale cardului nu trebuie comunicate la telefon. Un operator legitim nu are nevoie să primească aceste secrete de la tine.\n\nAi grijă și la cererile de instalare aplicații de remote access. Dacă cineva te ghidează să instalezi o aplicație pentru „verificări”, probabil încearcă să preia controlul dispozitivului.",
            ),
            (
                "Callback corect",
                "Închide apelul politicos și sună înapoi folosind un număr găsit independent: site oficial, spatele cardului, contract sau aplicație. Nu folosi numărul dictat de apelant și nu apăsa callback direct din istoricul apelului dacă există suspiciuni.\n\nÎn organizații, verifică cererile sensibile prin procedura internă. O cerere urgentă de plată, acces sau date trebuie confirmată de o persoană autorizată prin canal separat.",
            ),
            (
                "Semnale de risc",
                "- Apelantul te grăbește sau te amenință cu blocarea contului.\n- Cere coduri MFA sau parole.\n- Spune să nu închizi apelul.\n- Te roagă să instalezi aplicații.\n- Refuză verificarea prin canal oficial.\n- Schimbă povestea când ceri detalii concrete.",
            ),
        ),
    },
    "fake-websites": {
        "summary": "Învață să citești URL-uri, să identifici domeniul real și să eviți paginile false de autentificare.",
        "duration_minutes": 9,
        "sections": (
            (
                "Citirea corectă a URL-ului",
                "Atacatorii pot include numele unei organizații în subdomenii, căi sau parametri fără ca site-ul să aparțină acelei organizații. Partea importantă este domeniul registrabil, adică numele aflat imediat înainte de extensia principală.\n\nDe exemplu, într-o adresă de forma `login.banca.example.invalid`, proprietarul real este `example.invalid`, nu `banca`. Subdomeniile pot fi create de proprietarul domeniului real și pot conține orice text.",
            ),
            (
                "Typosquatting și pagini clonate",
                "Typosquatting-ul folosește adrese asemănătoare cu cele legitime: litere inversate, caractere lipsă, cratime sau extensii diferite. Pagina poate copia logo-ul, culorile și formularul de login.\n\nManagerul de parole este un semnal util: dacă nu completează automat datele pe o pagină unde în mod normal le completa, verifică domeniul înainte să introduci manual parola.",
            ),
            (
                "Checklist înainte de login",
                "- Ai tastat tu adresa sau ai venit dintr-un link primit?\n- Domeniul registrabil este exact cel oficial?\n- Conexiunea HTTPS există, dar nu o trata ca dovadă absolută.\n- Managerul de parole recunoaște domeniul?\n- Cererea de autentificare apare într-un context normal?\n- Pagina cere informații neobișnuite după login?",
            ),
            (
                "Acțiune defensivă",
                "Dacă ai dubii, închide pagina și deschide manual site-ul oficial. Pentru conturi importante, folosește bookmark-uri create de tine sau aplicația oficială. Dacă ai introdus parola pe un site suspect, schimb-o imediat din pagina oficială și verifică sesiunile active.",
            ),
        ),
    },
    "mfa-passwords": {
        "summary": "Construiește o apărare practică folosind parole unice, manager de parole, MFA rezistent și passkeys.",
        "duration_minutes": 8,
        "sections": (
            (
                "Apărare în profunzime",
                "Un cont sigur nu depinde de o singură măsură. Parolele unice reduc efectul reutilizării, MFA adaugă un pas suplimentar, iar passkeys reduc riscul de phishing deoarece sunt legate criptografic de domeniul legitim.\n\nDacă aceeași parolă este folosită în mai multe locuri, o breșă într-un serviciu slab poate compromite conturi importante. Managerul de parole ajută la parole unice și la detectarea domeniilor false.",
            ),
            (
                "MFA și oboseala la aprobare",
                "Atacatorii pot încerca MFA fatigue: trimit multe notificări de aprobare până când utilizatorul acceptă din grabă. O notificare MFA pe care nu ai inițiat-o este un semnal de alarmă, nu o formalitate.\n\nRăspuns sigur: respinge notificarea, schimbă parola contului și verifică sesiunile active. Nu comunica niciodată coduri MFA prin chat, telefon sau email.",
            ),
            (
                "Passkeys pe înțeles scurt",
                "Passkeys înlocuiesc parola cu o cheie criptografică legată de dispozitiv și domeniu. Utilizatorul confirmă cu biometrie, PIN sau metodă locală, iar secretul nu este trimis către site.\n\nAvantajul principal în context de phishing este că passkey-ul nu funcționează pe un domeniu fals. Chiar dacă pagina copiază designul, domeniul diferit blochează autentificarea corectă.",
            ),
            (
                "Obiceiuri recomandate",
                "- Folosește parole unice pentru conturile importante.\n- Activează MFA, preferabil aplicație authenticator sau passkey.\n- Păstrează codurile de recuperare într-un loc sigur.\n- Revizuiește sesiunile active periodic.\n- Nu aproba notificări MFA neașteptate.\n- Schimbă parolele compromise imediat.",
            ),
        ),
    },
    "social-engineering-advanced": {
        "summary": "Studiază atacuri personalizate: spear-phishing, pretexting, conturi compromise și fraude business email compromise.",
        "duration_minutes": 11,
        "sections": (
            (
                "Pretexte credibile",
                "Atacurile avansate nu se bazează doar pe mesaje generice. Ele folosesc informații despre roluri, proiecte, furnizori, evenimente reale sau conversații anterioare. Scopul este ca cererea să pară integrată natural în activitatea victimei.\n\nPretexting-ul construiește o poveste: cine este atacatorul, de ce are nevoie de ajutor, de ce solicitarea este urgentă și de ce procedura normală trebuie ocolită.",
            ),
            (
                "Business Email Compromise",
                "În BEC, atacatorul poate impersona un manager, un furnizor sau poate folosi chiar un cont compromis. Cererile vizează schimbări de cont bancar, plăți urgente, facturi, date despre clienți sau acces la sisteme.\n\nCel mai important control nu este tonul mesajului, ci procedura: schimbările financiare și accesul la date sensibile trebuie confirmate printr-un flux independent, cu aprobări clare.",
            ),
            (
                "Semnale subtile",
                "- Cererea pare normală, dar schimbă procedura obișnuită.\n- Expeditorul insistă pe confidențialitate neobișnuită.\n- Se cere o excepție „doar de data asta”.\n- Detaliile sunt personalizate, dar verificarea lipsește.\n- Contul folosit este nou sau canalul este diferit de cel normal.\n- Atașamentul sau linkul apare după câteva mesaje aparent legitime.",
            ),
            (
                "Răspuns la atacuri complexe",
                "Nu acuza direct persoana și nu continua negocierea în același canal. Confirmă cererea pe un canal deja cunoscut, aplică procedura internă și documentează semnalele observate. Pentru cereri financiare, folosește regula celor două aprobări sau validarea furnizorului prin date deja existente în sistem.",
            ),
        ),
    },
}

ORIGINAL_LESSON_UPDATES = {
    "phishing-101": {
        "summary": "Înțelege psihologia din spatele phishing-ului: urgență, autoritate și curiozitate.",
        "duration_minutes": 4,
        "sections": (
            (
                "Psihologia atacului",
                "Atacatorii folosesc urgența, autoritatea și curiozitatea pentru a reduce timpul acordat verificării.",
            ),
            (
                "Acțiune defensivă",
                "Oprește reacția automată și verifică solicitarea printr-un canal oficial separat.",
            ),
        ),
    },
    "email-red-flags": {
        "summary": "Domenii asemănătoare, expeditori nepotriviți, urgență și atașamente neașteptate.",
        "duration_minutes": 5,
        "sections": (
            (
                "Verificarea expeditorului",
                "Numele afișat poate fi falsificat. Verifică domeniul complet, răspunsul real și contextul solicitării.",
            ),
            (
                "Acțiune defensivă",
                "Nu deschide atașamente neașteptate și accesează contul direct din aplicația oficială.",
            ),
        ),
    },
    "smishing-deep-dive": {
        "summary": "Învață de ce mesajele scurte par credibile și cum verifici o alertă fără linkul primit.",
        "duration_minutes": 4,
        "sections": (
            (
                "De ce funcționează SMS-ul",
                "Mesajele scurte ascund contextul și folosesc notificări de livrare, amenzi sau blocări pentru a crea grabă.",
            ),
            (
                "Acțiune defensivă",
                "Nu folosi linkul primit. Verifică situația în aplicația oficială sau la numărul public al instituției.",
            ),
        ),
    },
    "vishing-callbacks": {
        "summary": "Recunoaște presiunea din apeluri și verifică identitatea printr-un canal separat.",
        "duration_minutes": 6,
        "sections": (
            (
                "Controlul conversației",
                "Un apelant poate falsifica numărul și poate folosi informații publice pentru credibilitate.",
            ),
            (
                "Acțiune defensivă",
                "Închide apelul și sună la un număr oficial. Nu comunica parole, coduri MFA sau date bancare.",
            ),
        ),
    },
    "fake-websites": {
        "summary": "Analizează domenii, subdomenii și pagini false de autentificare.",
        "duration_minutes": 5,
        "sections": (
            (
                "Citirea corectă a URL-ului",
                "Domeniul registrabil se citește înaintea extensiei; subdomeniile pot include numele unei organizații fără a-i aparține.",
            ),
            (
                "Acțiune defensivă",
                "Deschide manual site-ul oficial și folosește managerul de parole ca semnal suplimentar de verificare.",
            ),
        ),
    },
    "mfa-passwords": {
        "summary": "Protejează conturile cu parole unice, MFA rezistent la phishing și passkeys.",
        "duration_minutes": 5,
        "sections": (
            (
                "Apărare în profunzime",
                "Parolele unice limitează reutilizarea credentialelor, iar passkeys reduc riscul de phishing.",
            ),
            (
                "Acțiune defensivă",
                "Nu aproba notificări MFA neașteptate și nu comunica niciodată coduri de autentificare.",
            ),
        ),
    },
    "social-engineering-advanced": {
        "summary": "Studiază spear-phishing, pretexting și compromiterea emailului de business.",
        "duration_minutes": 7,
        "sections": (
            (
                "Pretexte credibile",
                "Atacurile avansate folosesc procese reale, relații profesionale și conversații compromise.",
            ),
            (
                "Acțiune defensivă",
                "Aplică verificări procedurale pentru schimbări de plată, acces sau date sensibile, indiferent de aparenta autoritate.",
            ),
        ),
    },
}


def _section_rows(source: dict[str, dict[str, object]]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for lesson_id, lesson in source.items():
        for index, (title, body) in enumerate(lesson["sections"], start=1):
            rows.append(
                {
                    "id": f"{lesson_id}-section-{index}",
                    "lesson_id": lesson_id,
                    "title": title,
                    "body": body,
                    "order_index": index,
                }
            )
    return rows


def _known_lesson_ids_sql() -> str:
    return ", ".join(f"'{lesson_id}'" for lesson_id in LESSON_UPDATES)


def _apply_lessons(source: dict[str, dict[str, object]]) -> None:
    now = datetime.now(timezone.utc)
    for lesson_id, lesson in source.items():
        op.execute(
            sa.text(
                """
                UPDATE learning_lessons
                SET summary = :summary,
                    duration_minutes = :duration_minutes,
                    updated_at = :updated_at
                WHERE id = :lesson_id
                """
            ).bindparams(
                lesson_id=lesson_id,
                summary=lesson["summary"],
                duration_minutes=lesson["duration_minutes"],
                updated_at=now,
            )
        )

    op.execute(
        sa.text(
            f"DELETE FROM learning_lesson_sections WHERE lesson_id IN ({_known_lesson_ids_sql()})"
        )
    )
    section_table = sa.table(
        "learning_lesson_sections",
        sa.column("id"),
        sa.column("lesson_id"),
        sa.column("title"),
        sa.column("body"),
        sa.column("order_index"),
    )
    op.bulk_insert(section_table, _section_rows(source))


def upgrade() -> None:
    _apply_lessons(LESSON_UPDATES)


def downgrade() -> None:
    _apply_lessons(ORIGINAL_LESSON_UPDATES)
