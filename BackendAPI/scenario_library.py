from __future__ import annotations

from random import choice

from scenario_models import (
    AttackType,
    DifficultyLevel,
    ScenarioOption,
    ScenarioRule,
    ScenarioTemplate,
)

ScenarioKey = tuple[AttackType, DifficultyLevel]

ALL_ATTACK_TYPES: tuple[AttackType, ...] = ("phishing", "smishing", "impersonation")
ALL_DIFFICULTIES: tuple[DifficultyLevel, ...] = ("easy", "medium", "hard")

SCENARIO_LIBRARY: dict[ScenarioKey, list[ScenarioTemplate]] = {
    (
        "phishing",
        "easy",
    ): [
        ScenarioTemplate(
            channel="email",
            attacker_message=(
                "Subiect: Actiune urgenta: contul tau va fi suspendat in 30 de minute. "
                "Acceseaza imediat secure-banking-check.com pentru verificare."
            ),
            options=[
                ScenarioOption(id="click", text="Dau click pe link si completez datele cerute."),
                ScenarioOption(id="reply", text="Raspund la mesaj si cer mai multe detalii."),
                ScenarioOption(id="report", text="Nu interactionez cu linkul si raportez mesajul."),
            ],
            red_flags=[
                "Urgenta artificiala (presiune de timp)",
                "Domeniu suspect, diferit de cel oficial",
                "Solicitare de verificare prin link extern",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Nu ai interactionat cu linkul suspect si ai ales raportarea mesajului."
                ),
                incorrect_explanation=(
                    "Alegerea nu este sigura. Mesajul foloseste tactici clasice de phishing: urgenta falsa "
                    "si link neoficial."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="email",
            attacker_message=(
                "Subiect: Parola expira azi. Confirma contul in securizare-user-access.net "
                "pentru a evita blocarea accesului."
            ),
            options=[
                ScenarioOption(id="click", text="Accesez linkul si schimb parola imediat."),
                ScenarioOption(id="reply", text="Raspund la email cu datele de autentificare cerute."),
                ScenarioOption(id="report", text="Verific in portalul oficial si raportez emailul."),
            ],
            red_flags=[
                "Link de resetare pe domeniu neoficial",
                "Presiune prin amenintarea blocarii contului",
                "Cerere de actiune imediata fara verificare",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Ai evitat linkul suspect si ai ales verificarea prin canal oficial."
                ),
                incorrect_explanation=(
                    "Emailurile despre conturi blocate sunt frecvent folosite pentru furtul credentialelor."
                ),
            ),
        )
    ],
    (
        "phishing",
        "medium",
    ): [
        ScenarioTemplate(
            channel="email",
            attacker_message=(
                "Subiect: Factura neachitata - actiune necesara azi. "
                "Vezi detalii in portalul securizat invoice-company-secure.net/login."
            ),
            options=[
                ScenarioOption(id="click", text="Deschid linkul si verific factura direct acolo."),
                ScenarioOption(id="reply", text="Cer pe email detalii suplimentare despre factura."),
                ScenarioOption(id="report", text="Verific prin canal oficial si raportez emailul."),
            ],
            red_flags=[
                "Domeniu asemanator dar neoficial",
                "Presiune de tip 'azi' pentru decizie rapida",
                "Cerere de autentificare din email",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Ai evitat accesarea linkului din email si ai ales verificarea prin canal oficial."
                ),
                incorrect_explanation=(
                    "Nu este sigur sa urmezi instructiuni din email fara verificare independenta a expeditorului."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="email",
            attacker_message=(
                "Subiect: Actualizare date salarizare Q2. Te rugam sa reconfirmi IBAN-ul in "
                "portalul hr-secure-payroll.com pana la finalul zilei."
            ),
            options=[
                ScenarioOption(id="click", text="Deschid portalul din email si completez datele."),
                ScenarioOption(id="reply", text="Trimit direct pe email IBAN-ul pentru confirmare."),
                ScenarioOption(id="report", text="Verific prin departamentul HR pe canal intern si raportez."),
            ],
            red_flags=[
                "Portal extern care imita serviciu intern",
                "Solicitare de date financiare sensibile",
                "Urgenta artificiala la final de zi",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Datele de salarizare se confirma doar prin canale interne oficiale."
                ),
                incorrect_explanation=(
                    "Atacatorii folosesc pretexte de salarizare pentru a obtine date bancare."
                ),
            ),
        )
    ],
    (
        "phishing",
        "hard",
    ): [
        ScenarioTemplate(
            channel="email",
            attacker_message=(
                "Subiect: Confirmare dispozitiv nou conectat. "
                "Daca nu recunosti activitatea, valideaza in urmatoarele 10 minute la secure-login-bt.ro/session."
            ),
            options=[
                ScenarioOption(id="click", text="Intru rapid pe link ca sa blochez accesul."),
                ScenarioOption(id="reply", text="Raspund la email pentru confirmare."),
                ScenarioOption(id="report", text="Deschid aplicatia oficiala separat si raportez emailul."),
            ],
            red_flags=[
                "URL ce imita o institutie legitima",
                "Fereastra de timp foarte scurta pentru panica",
                "Validare de sesiune ceruta prin link extern",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Ai evitat validarea prin link si ai folosit canalul oficial separat."
                ),
                incorrect_explanation=(
                    "Atacurile avansate copieaza bine comunicarea legitima. Verifica mereu in aplicatia oficiala."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="email",
            attacker_message=(
                "RE: Contract semnat - feedback CFO. Inainte de call, deschide rapid documentul in "
                "sharepoint-secure-docs.net pentru modificarile finale."
            ),
            options=[
                ScenarioOption(id="click", text="Deschid imediat documentul din threadul existent."),
                ScenarioOption(id="reply", text="Raspund in thread si cer detalii suplimentare."),
                ScenarioOption(id="report", text="Nu accesez linkul; verific separat identitatea expeditorului."),
            ],
            red_flags=[
                "Thread hijacking cu context aparent legitim",
                "Domeniu asemanator, dar diferit de cel oficial",
                "Presiune de timp inainte de sedinta",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Chiar in threaduri legitime, linkurile trebuie verificate independent."
                ),
                incorrect_explanation=(
                    "Atacurile avansate compromit conversatii reale pentru a induce incredere falsa."
                ),
            ),
        )
    ],
    (
        "smishing",
        "easy",
    ): [
        ScenarioTemplate(
            channel="sms",
            attacker_message=(
                "[Curier] Coletul tau nu poate fi livrat. Plateste taxa de redirectionare aici: bit.ly/track-urgent"
            ),
            options=[
                ScenarioOption(id="click", text="Accesez linkul si platesc taxa imediat."),
                ScenarioOption(
                    id="call_official", text="Sun la numarul oficial al curierului pentru verificare."
                ),
                ScenarioOption(id="report", text="Ignor mesajul si il raportez ca spam."),
            ],
            red_flags=[
                "Link prescurtat, imposibil de verificat vizual",
                "Cerere urgenta de plata",
                "Lipsa datelor concrete despre colet",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Ai evitat linkul SMS si ai tratat mesajul ca potential smishing."
                ),
                incorrect_explanation=(
                    "Linkurile primite prin SMS pot duce la pagini frauduloase. Verifica doar prin aplicatia oficiala."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="sms",
            attacker_message=(
                "[Telecom] Punctele tale de fidelitate expira azi. Activeaza voucherul pe "
                "bonus-client-mobile.net in urmatoarele 20 minute."
            ),
            options=[
                ScenarioOption(id="click", text="Accesez linkul ca sa nu pierd voucherul."),
                ScenarioOption(
                    id="call_official", text="Contactez operatorul din aplicatia oficiala pentru verificare."
                ),
                ScenarioOption(id="report", text="Nu intru pe link si raportez SMS-ul ca spam."),
            ],
            red_flags=[
                "Domeniu promotional neoficial",
                "Presiune de timp foarte scurta",
                "Incentivare financiara pentru reactie impulsiva",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Ai evitat interactiunea cu linkul promotional suspect."
                ),
                incorrect_explanation=(
                    "Mesajele cu premii urgente sunt frecvent folosite pentru phishing prin SMS."
                ),
            ),
        )
    ],
    (
        "smishing",
        "medium",
    ): [
        ScenarioTemplate(
            channel="sms",
            attacker_message=(
                "[ANAF] Ai o rambursare de 286 RON. Completeaza contul pentru virament: anaf-verificare.info"
            ),
            options=[
                ScenarioOption(id="click", text="Completez rapid datele pentru a primi rambursarea."),
                ScenarioOption(
                    id="call_official", text="Verific pe site-ul oficial ANAF, fara link din mesaj."
                ),
                ScenarioOption(id="report", text="Raportez mesajul si nu trimit date personale."),
            ],
            red_flags=[
                "Domeniu neoficial pentru institutie publica",
                "Promisiune financiara pentru a induce reactie rapida",
                "Colectare de date personale prin SMS",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Nu ai oferit date personale pe baza unui SMS nesolicitat."
                ),
                incorrect_explanation=(
                    "Mesajele care cer date sensibile pentru beneficii financiare sunt frecvent fraude de tip smishing."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="sms",
            attacker_message=(
                "[eMAG Delivery] Livrarea comenzii tale este in asteptare. Confirma adresa prin "
                "emag-shipping-update.net pentru reluarea expedierii."
            ),
            options=[
                ScenarioOption(id="click", text="Confirm adresa in link pentru a primi coletul."),
                ScenarioOption(
                    id="call_official", text="Verific statusul comenzii in aplicatia oficiala."
                ),
                ScenarioOption(id="report", text="Ignor linkul din SMS si raportez mesajul."),
            ],
            red_flags=[
                "Domeniu care imita un brand cunoscut",
                "Solicitare de confirmare date prin link extern",
                "Pretext logistic pentru colectare de date",
            ],
            rule=ScenarioRule(
                correct_option_id="report",
                correct_explanation=(
                    "Corect. Ai ales verificarea in aplicatia oficiala, nu pe link-ul din SMS."
                ),
                incorrect_explanation=(
                    "Smishing-ul foloseste branduri de livrare pentru a obtine date personale."
                ),
            ),
        )
    ],
    (
        "smishing",
        "hard",
    ): [
        ScenarioTemplate(
            channel="sms",
            attacker_message=(
                "[Banca] Tranzactie potential riscanta blocata. Confirma identitatea in 5 min: secure-banking-alert.ro"
            ),
            options=[
                ScenarioOption(id="click", text="Confirm prin link pentru a nu ramane cu cardul blocat."),
                ScenarioOption(id="call_official", text="Sun imediat la numarul oficial de pe card."),
                ScenarioOption(id="report", text="Raportez SMS-ul si nu folosesc linkul primit."),
            ],
            red_flags=[
                "Mesaj cu ton urgent despre bani",
                "Validare identitate ceruta in afara aplicatiei oficiale",
                "Domeniu diferit de canalele oficiale ale bancii",
            ],
            rule=ScenarioRule(
                correct_option_id="call_official",
                correct_explanation=(
                    "Corect. Verificarea directa la numarul oficial este cea mai sigura in situatii financiare urgente."
                ),
                incorrect_explanation=(
                    "Nu confirma niciodata identitatea prin link din SMS. Contacteaza institutia prin canal oficial."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="sms",
            attacker_message=(
                "[Banca] Aplicatia ta necesita sincronizare imediata de securitate. Valideaza dispozitivul la "
                "banking-sync-auth.ro in maxim 7 minute."
            ),
            options=[
                ScenarioOption(id="click", text="Fac sincronizarea imediat din link."),
                ScenarioOption(
                    id="call_official", text="Contactez banca la numarul oficial inainte de orice actiune."
                ),
                ScenarioOption(id="report", text="Sterg mesajul si ignor complet situatia."),
            ],
            red_flags=[
                "Link extern pentru operatie de securitate sensibila",
                "Cronometru scurt pentru panica",
                "Lipsa notificarii in aplicatia oficiala",
            ],
            rule=ScenarioRule(
                correct_option_id="call_official",
                correct_explanation=(
                    "Corect. Ai trecut pe un canal de incredere controlat de tine."
                ),
                incorrect_explanation=(
                    "Operatiunile bancare de securitate nu se confirma prin linkuri primite in SMS."
                ),
            ),
        )
    ],
    (
        "impersonation",
        "easy",
    ): [
        ScenarioTemplate(
            channel="chat",
            attacker_message=(
                "Salut, sunt Alex din IT. Avem mentenanta urgenta. Trimite-mi codul de verificare primit pe telefon."
            ),
            options=[
                ScenarioOption(id="share_code", text="Trimit codul pentru a ajuta echipa IT."),
                ScenarioOption(
                    id="verify_identity",
                    text="Verific identitatea prin ticket intern sau apel oficial.",
                ),
                ScenarioOption(id="ignore", text="Ignor mesajul fara sa fac nimic."),
            ],
            red_flags=[
                "Solicitare directa de cod MFA",
                "Invocarea unei urgente tehnice",
                "Lipsa unui canal oficial de suport",
            ],
            rule=ScenarioRule(
                correct_option_id="verify_identity",
                correct_explanation=(
                    "Corect. Codurile MFA nu se distribuie, iar identitatea trebuie verificata pe canal oficial."
                ),
                incorrect_explanation=(
                    "Impersonarea de suport IT tinteste codurile MFA. Verifica identitatea inainte de orice actiune."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="chat",
            attacker_message=(
                "Salut, sunt de la helpdesk. Avem o eroare pe contul tau, trimite-mi codul OTP primit acum "
                "ca sa finalizez resetarea."
            ),
            options=[
                ScenarioOption(id="share_code", text="Trimit codul OTP ca sa rezolv rapid."),
                ScenarioOption(
                    id="verify_identity",
                    text="Deschid ticket oficial si verific identitatea solicitantului.",
                ),
                ScenarioOption(id="ignore", text="Raspund partial doar cu ultimele cifre ale codului."),
            ],
            red_flags=[
                "Solicitare de OTP pe chat",
                "Pretext tehnic urgent fara ticket oficial",
                "Bypass al procedurilor standard de suport",
            ],
            rule=ScenarioRule(
                correct_option_id="verify_identity",
                correct_explanation=(
                    "Corect. OTP-ul nu se comunica, iar suportul se valideaza prin sistemul intern."
                ),
                incorrect_explanation=(
                    "Impersonarea suportului urmareste preluarea contului prin coduri de autentificare."
                ),
            ),
        )
    ],
    (
        "impersonation",
        "medium",
    ): [
        ScenarioTemplate(
            channel="chat",
            attacker_message=(
                "Buna, sunt managerul tau. Sunt intr-o sedinta si am nevoie urgent sa cumperi 3 gift card-uri."
            ),
            options=[
                ScenarioOption(id="comply", text="Cumpar gift card-urile si trimit codurile imediat."),
                ScenarioOption(
                    id="verify_identity", text="Confirm cererea prin apel direct catre manager."
                ),
                ScenarioOption(id="delay", text="Aman cateva ore pana vad ce se intampla."),
            ],
            red_flags=[
                "Cerere financiara neobisnuita",
                "Presiune pe urgenta si confidentialitate",
                "Canal de comunicare atipic pentru astfel de solicitari",
            ],
            rule=ScenarioRule(
                correct_option_id="verify_identity",
                correct_explanation=(
                    "Corect. Cererile financiare urgente trebuie validate printr-un canal secundar de incredere."
                ),
                incorrect_explanation=(
                    "Fraudele de impersonare folosesc autoritatea falsa. Nu executa cereri sensibile fara verificare."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="chat",
            attacker_message=(
                "Salut, sunt directorul financiar. Trimite urgent lista cu angajatii si salariile pe emailul meu "
                "personal, sunt in deplasare."
            ),
            options=[
                ScenarioOption(id="comply", text="Trimit fisierul pentru ca pare cerere de la conducere."),
                ScenarioOption(
                    id="verify_identity", text="Validez cererea cu directorul prin canal intern oficial."
                ),
                ScenarioOption(id="delay", text="Aman cateva ore pana imi amintesc daca e normal."),
            ],
            red_flags=[
                "Cerere de date sensibile prin canal atipic",
                "Folosirea autoritatii ierarhice pentru presiune",
                "Solicitare catre email personal",
            ],
            rule=ScenarioRule(
                correct_option_id="verify_identity",
                correct_explanation=(
                    "Corect. Datele sensibile se transmit doar dupa validare stricta in canal intern."
                ),
                incorrect_explanation=(
                    "Impersonarea executiva foloseste urgenta si autoritate pentru exfiltrarea datelor."
                ),
            ),
        )
    ],
    (
        "impersonation",
        "hard",
    ): [
        ScenarioTemplate(
            channel="phone",
            attacker_message=(
                "Sunt din echipa de securitate. Detectam activitate suspecta pe contul tau. "
                "Instaleaza AnyDesk si spune-mi codul de sesiune."
            ),
            options=[
                ScenarioOption(id="comply", text="Instalez aplicatia si ofer codul de sesiune."),
                ScenarioOption(
                    id="verify_identity",
                    text="Inchid apelul si contactez securitatea la numarul oficial.",
                ),
                ScenarioOption(
                    id="share_partial",
                    text="Ofer doar partial datele cerute, ca sa verific intentia.",
                ),
            ],
            red_flags=[
                "Cerere de control la distanta al dispozitivului",
                "Presiune prin invocarea unei brese",
                "Lipsa confirmarii prin canal oficial cunoscut",
            ],
            rule=ScenarioRule(
                correct_option_id="verify_identity",
                correct_explanation=(
                    "Corect. Ai intrerupt interactiunea si ai trecut pe un canal oficial, controlat de tine."
                ),
                incorrect_explanation=(
                    "Atacatorii se prezinta drept suport tehnic pentru acces remote. "
                    "Nu instala tool-uri la cerere telefonica."
                ),
            ),
        ),
        ScenarioTemplate(
            channel="phone",
            attacker_message=(
                "Sunt CFO-ul companiei. Avem audit in desfasurare si trebuie sa faci discret un transfer "
                "catre noul cont al partenerului. Iti trimit imediat IBAN-ul pe SMS."
            ),
            options=[
                ScenarioOption(id="comply", text="Execut transferul urgent pentru a evita problemele."),
                ScenarioOption(
                    id="verify_identity",
                    text="Refuz executia si verific instructiunea prin fluxul oficial de aprobare.",
                ),
                ScenarioOption(
                    id="share_partial",
                    text="Cer doar o confirmare verbala suplimentara si continui procesul.",
                ),
            ],
            red_flags=[
                "Frauda de tip CEO/CFO impersonation",
                "Cerere financiara urgenta in afara procedurii",
                "Insistenta pe confidentialitate",
            ],
            rule=ScenarioRule(
                correct_option_id="verify_identity",
                correct_explanation=(
                    "Corect. Cererile de transfer trebuie validate in workflow-ul oficial, nu la telefon."
                ),
                incorrect_explanation=(
                    "Atacurile de business email/voice compromise exploateaza autoritatea pentru fraude financiare."
                ),
            ),
        )
    ],
}


def validate_scenario_library() -> None:
    expected_keys = {
        (attack_type, difficulty)
        for attack_type in ALL_ATTACK_TYPES
        for difficulty in ALL_DIFFICULTIES
    }
    missing_keys = expected_keys - set(SCENARIO_LIBRARY)

    if missing_keys:
        missing = ", ".join(f"{attack_type}:{difficulty}" for attack_type, difficulty in sorted(missing_keys))
        raise RuntimeError(f"Scenario library is missing combinations: {missing}")

    empty_keys = [
        (attack_type, difficulty)
        for (attack_type, difficulty), templates in SCENARIO_LIBRARY.items()
        if not templates
    ]
    if empty_keys:
        empty = ", ".join(f"{attack_type}:{difficulty}" for attack_type, difficulty in sorted(empty_keys))
        raise RuntimeError(f"Scenario library has empty template lists: {empty}")

    insufficient_variants = [
        (attack_type, difficulty)
        for (attack_type, difficulty), templates in SCENARIO_LIBRARY.items()
        if len(templates) < 2
    ]
    if insufficient_variants:
        insufficient = ", ".join(
            f"{attack_type}:{difficulty}" for attack_type, difficulty in sorted(insufficient_variants)
        )
        raise RuntimeError(f"Each combination must have at least 2 templates: {insufficient}")


def build_scenario_template_id(
    attack_type: AttackType,
    difficulty: DifficultyLevel,
    template_index: int,
) -> str:
    return f"{attack_type}-{difficulty}-{template_index + 1}"


def get_scenario_template(
    attack_type: AttackType,
    difficulty: DifficultyLevel,
    template_id: str | None = None,
) -> ScenarioTemplate:
    _, template = get_scenario_template_selection(attack_type, difficulty, template_id)
    return template


def get_scenario_template_selection(
    attack_type: AttackType,
    difficulty: DifficultyLevel,
    template_id: str | None = None,
    excluded_template_ids: set[str] | None = None,
) -> tuple[str, ScenarioTemplate]:
    templates = SCENARIO_LIBRARY[(attack_type, difficulty)]

    if template_id is not None:
        for template_index, template in enumerate(templates):
            if build_scenario_template_id(attack_type, difficulty, template_index) == template_id:
                return template_id, template.model_copy(deep=True)
        raise ValueError(
            f"Template '{template_id}' does not match attack type '{attack_type}' "
            f"and difficulty '{difficulty}'"
        )

    excluded = excluded_template_ids or set()
    candidate_indexes = [
        index
        for index in range(len(templates))
        if build_scenario_template_id(attack_type, difficulty, index) not in excluded
    ]
    if not candidate_indexes:
        candidate_indexes = list(range(len(templates)))

    selected_index = choice(candidate_indexes)
    selected_template = templates[selected_index]
    resolved_template_id = build_scenario_template_id(attack_type, difficulty, selected_index)
    return resolved_template_id, selected_template.model_copy(deep=True)


validate_scenario_library()
