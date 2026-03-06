export type SuggestionDomain =
  | 'famille'
  | 'commercial'
  | 'pénal'
  | 'travail'
  | 'immobilier'
  | 'administratif'

export type SuggestionMode = 'chat' | 'structure' | 'ariida'

export interface Suggestion {
  id: string
  label: string
  send: string
  domain: SuggestionDomain
  icon: string
  mode: SuggestionMode
}

export const DOMAIN_COLORS: Record<SuggestionDomain, string> = {
  famille: 'text-pink-600 bg-pink-50 border-pink-200 dark:text-pink-400 dark:bg-pink-950/40 dark:border-pink-800',
  commercial: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',
  pénal: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',
  travail: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800',
  immobilier: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800',
  administratif: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/40 dark:border-violet-800',
}

export const DOMAIN_DOT_COLORS: Record<SuggestionDomain, string> = {
  famille: 'bg-pink-500',
  commercial: 'bg-amber-500',
  pénal: 'bg-red-500',
  travail: 'bg-blue-500',
  immobilier: 'bg-green-500',
  administratif: 'bg-violet-500',
}

// ─── MODE : chat ──────────────────────────────────────────────────────────────

const CHAT_SUGGESTIONS: Suggestion[] = [
  // Famille
  {
    id: 'chat-famille-1',
    label: 'Divorce et garde',
    send: 'Mon mari veut divorcer et menace de prendre la garde de nos enfants. Quels sont mes droits selon le Code du statut personnel tunisien ?',
    domain: 'famille',
    icon: 'users',
    mode: 'chat',
  },
  {
    id: 'chat-famille-2',
    label: 'Pension alimentaire',
    send: "Mon ex-mari ne paie plus la pension alimentaire depuis 3 mois. Comment forcer l'exécution du jugement de divorce en Tunisie ?",
    domain: 'famille',
    icon: 'users',
    mode: 'chat',
  },
  {
    id: 'chat-famille-3',
    label: 'Héritage et succession',
    send: 'Mon père est décédé sans testament. Comment se fait le partage de la succession entre les héritiers selon la loi tunisienne ?',
    domain: 'famille',
    icon: 'users',
    mode: 'chat',
  },
  {
    id: 'chat-famille-4',
    label: 'Violence conjugale',
    send: "Je subis des violences de mon conjoint. Quelles sont mes options légales en urgence selon la loi n°58-2017 sur l'élimination de la violence à l'égard des femmes ?",
    domain: 'famille',
    icon: 'users',
    mode: 'chat',
  },
  // Commercial
  {
    id: 'chat-commercial-1',
    label: 'Impayés fournisseur',
    send: 'Mon fournisseur ne me règle pas 3 factures depuis 4 mois. Quelle procédure suivre pour recouvrer ma créance commerciale en Tunisie ?',
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'chat',
  },
  {
    id: 'chat-commercial-2',
    label: 'Rupture de contrat',
    send: "Mon partenaire commercial a rompu notre contrat sans préavis et sans motif légitime. Quels sont mes recours selon le COCC tunisien ?",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'chat',
  },
  {
    id: 'chat-commercial-3',
    label: 'Création SARL',
    send: 'Je veux créer une SARL en Tunisie avec deux associés. Quelles sont les étapes, le capital minimum et les formalités obligatoires ?',
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'chat',
  },
  {
    id: 'chat-commercial-4',
    label: 'Chèque sans provision',
    send: "J'ai reçu un chèque sans provision d'un client. Quelles sont les procédures pénales et civiles disponibles contre lui en Tunisie ?",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'chat',
  },
  // Pénal
  {
    id: 'chat-penal-1',
    label: 'Convocation police',
    send: "J'ai reçu une convocation au commissariat en tant que suspect. Quels sont mes droits lors de la garde à vue selon le code de procédure pénale tunisien ?",
    domain: 'pénal',
    icon: 'shield',
    mode: 'chat',
  },
  {
    id: 'chat-penal-2',
    label: 'Plainte pour arnaque',
    send: "J'ai été victime d'une arnaque en ligne (faux vendeur sur Facebook). Comment porter plainte et quelles preuves rassembler ?",
    domain: 'pénal',
    icon: 'shield',
    mode: 'chat',
  },
  {
    id: 'chat-penal-3',
    label: 'Diffamation réseaux',
    send: 'Quelqu\'un diffuse de fausses informations me concernant sur Facebook. Quelle infraction caractérise cela et comment me défendre légalement ?',
    domain: 'pénal',
    icon: 'shield',
    mode: 'chat',
  },
  {
    id: 'chat-penal-4',
    label: 'Casier judiciaire',
    send: 'Comment obtenir un extrait de casier judiciaire en Tunisie et dans quel délai ? Peut-on en demander la réhabilitation ?',
    domain: 'pénal',
    icon: 'shield',
    mode: 'chat',
  },
  // Travail
  {
    id: 'chat-travail-1',
    label: 'Licenciement abusif',
    send: "Mon employeur m'a licencié verbalement sans lettre ni indemnité. Que dit le Code du travail tunisien sur le licenciement abusif ?",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'chat',
  },
  {
    id: 'chat-travail-2',
    label: 'Heures sup impayées',
    send: "Mon employeur ne paie pas mes heures supplémentaires depuis 6 mois. Quels sont mes droits et comment les récupérer légalement ?",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'chat',
  },
  {
    id: 'chat-travail-3',
    label: 'Harcèlement au travail',
    send: "Mon supérieur me harcèle moralement depuis plusieurs mois. Quelles protections offre le droit du travail tunisien dans ce cas ?",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'chat',
  },
  {
    id: 'chat-travail-4',
    label: 'Accident du travail',
    send: "J'ai eu un accident sur mon lieu de travail. Quelles démarches effectuer pour bénéficier de la couverture CNAM et quels délais respecter ?",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'chat',
  },
  // Immobilier
  {
    id: 'chat-immobilier-1',
    label: 'Loyer impayé',
    send: "Mon locataire ne paie plus le loyer depuis 2 mois et refuse de partir. Quelle procédure d'expulsion puis-je engager en Tunisie ?",
    domain: 'immobilier',
    icon: 'home',
    mode: 'chat',
  },
  {
    id: 'chat-immobilier-2',
    label: 'Litige propriété',
    send: "Mon voisin a empiété sur mon terrain lors d'une construction. Quels recours ai-je pour faire respecter les limites de ma propriété ?",
    domain: 'immobilier',
    icon: 'home',
    mode: 'chat',
  },
  {
    id: 'chat-immobilier-3',
    label: 'Contrat location',
    send: "Mon propriétaire veut augmenter le loyer en cours de bail. Est-ce légal selon la loi tunisienne sur les baux d'habitation ?",
    domain: 'immobilier',
    icon: 'home',
    mode: 'chat',
  },
  {
    id: 'chat-immobilier-4',
    label: 'Achat sans titre',
    send: "J'ai acheté un terrain sans titre foncier (melk). Comment régulariser la situation et quels risques cela comporte-t-il ?",
    domain: 'immobilier',
    icon: 'home',
    mode: 'chat',
  },
  // Administratif
  {
    id: 'chat-admin-1',
    label: 'Recours décision admin',
    send: "L'administration a refusé ma demande de permis de construire sans motif. Comment contester cette décision devant le tribunal administratif ?",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'chat',
  },
  {
    id: 'chat-admin-2',
    label: 'Mutuelle fonctionnaire',
    send: "En tant que fonctionnaire, l'administration refuse de me rembourser des frais médicaux couverts par ma mutuelle. Que faire ?",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'chat',
  },
  {
    id: 'chat-admin-3',
    label: 'Marchés publics',
    send: "Mon offre pour un marché public a été injustement rejetée. Quelles voies de recours existent en Tunisie pour contester cette décision ?",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'chat',
  },
  {
    id: 'chat-admin-4',
    label: 'Nationalité tunisienne',
    send: 'Quelles sont les conditions et procédures pour acquérir la nationalité tunisienne par naturalisation selon la loi en vigueur ?',
    domain: 'administratif',
    icon: 'landmark',
    mode: 'chat',
  },
]

// ─── MODE : structure ─────────────────────────────────────────────────────────

const STRUCTURE_SUGGESTIONS: Suggestion[] = [
  // Famille
  {
    id: 'str-famille-1',
    label: 'Divorce avec enfants',
    send: "Je me suis marié en 2015. Nous avons deux enfants de 5 et 8 ans. Mon épouse veut divorcer. Je veux obtenir la garde des enfants et contester la pension alimentaire qu'elle réclame.",
    domain: 'famille',
    icon: 'users',
    mode: 'structure',
  },
  {
    id: 'str-famille-2',
    label: 'Succession bloquée',
    send: "Mon père est décédé en janvier 2024. Il possédait une maison à Tunis et un terrain à Nabeul. Mon frère aîné refuse de procéder au partage et occupe seul la maison familiale depuis 6 mois.",
    domain: 'famille',
    icon: 'users',
    mode: 'structure',
  },
  {
    id: 'str-famille-3',
    label: 'Pension impayée',
    send: "Divorcée depuis 2022, le tribunal a fixé une pension alimentaire de 400 DT/mois pour mes deux enfants. Mon ex-mari n'a rien payé depuis 4 mois malgré mes relances. J'ai un jugement exécutoire.",
    domain: 'famille',
    icon: 'users',
    mode: 'structure',
  },
  {
    id: 'str-famille-4',
    label: 'Enlèvement parental',
    send: "Mon ex-épouse a quitté la Tunisie avec nos enfants sans mon accord et sans autorisation judiciaire. Nous sommes officiellement divorcés et j'ai un droit de visite. Elle est actuellement en France.",
    domain: 'famille',
    icon: 'users',
    mode: 'structure',
  },
  // Commercial
  {
    id: 'str-commercial-1',
    label: 'Impayé 80 000 DT',
    send: "J'ai livré des marchandises à une société à Sfax en septembre 2023 pour un montant de 80 000 DT. Malgré 3 relances écrites et 2 mises en demeure, la société n'a pas réglé. Elle prétend avoir des problèmes de trésorerie.",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'structure',
  },
  {
    id: 'str-commercial-2',
    label: 'Associé frauduleux',
    send: "Je suis associé à 50% dans une SARL. Mon associé prend des décisions seul, signe des contrats sans mon accord et a détourné des fonds de la société vers son compte personnel. J'ai des relevés bancaires comme preuve.",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'structure',
  },
  {
    id: 'str-commercial-3',
    label: 'Contrat rompu',
    send: "J'avais un contrat de distribution exclusive avec une entreprise française pour 2 ans. Après 8 mois, ils ont nommé un autre distributeur en Tunisie sans préavis ni indemnité, causant une perte estimée à 150 000 DT.",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'structure',
  },
  {
    id: 'str-commercial-4',
    label: 'Faillite fournisseur',
    send: "Mon principal fournisseur a été placé en liquidation judiciaire. Je lui dois 30 000 DT et il me doit 55 000 DT de marchandises non livrées. Comment déclarer ma créance et récupérer mon argent ?",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'structure',
  },
  // Pénal
  {
    id: 'str-penal-1',
    label: 'Escroquerie immobilière',
    send: "J'ai versé 45 000 DT à un promoteur immobilier en 2022 pour un appartement sur plan. La livraison était prévue en décembre 2023. Le promoteur est injoignable depuis mars 2024 et le chantier est à l'arrêt.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'structure',
  },
  {
    id: 'str-penal-2',
    label: 'Agression physique',
    send: "J'ai été agressé physiquement par mon voisin suite à un différend sur un stationnement. J'ai été hospitalisé 2 jours avec 15 jours d'ITT. J'ai le certificat médical. L'agression a eu lieu devant témoins.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'structure',
  },
  {
    id: 'str-penal-3',
    label: 'Vol avec effraction',
    send: "Mon bureau a été cambriolé la nuit du 12 au 13 mars 2024. Les voleurs ont emporté du matériel informatique d'une valeur de 25 000 DT. La police a relevé des empreintes mais n'a pas encore identifié les suspects.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'structure',
  },
  {
    id: 'str-penal-4',
    label: 'Cyberharcèlement',
    send: "Un inconnu publie depuis 3 mois des photos montées et de fausses informations me concernant sur des groupes Facebook locaux, affectant ma réputation professionnelle et ma vie privée. J'ai sauvegardé toutes les publications.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'structure',
  },
  // Travail
  {
    id: 'str-travail-1',
    label: 'Licenciement verbal',
    send: "Je travaillais depuis 7 ans dans une entreprise de BTP. Le directeur m'a congédié verbalement il y a 3 semaines, sans lettre, sans indemnité de licenciement et sans solde de tout compte. Mon salaire de mars n'a pas été versé non plus.",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'structure',
  },
  {
    id: 'str-travail-2',
    label: 'Accident chantier',
    send: "J'ai chuté d'un échafaudage sur mon lieu de travail le 5 février 2024. J'ai une fracture du poignet. Mon employeur refuse de déclarer l'accident à la CNAM et prétend que c'était ma faute. Je n'ai pas de contrat écrit.",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'structure',
  },
  {
    id: 'str-travail-3',
    label: 'Non-déclaration CNSS',
    send: "J'ai découvert que mon employeur ne me déclare pas à la CNSS depuis 3 ans alors qu'il déduit des cotisations sur ma fiche de paie. J'ai les fiches de paie comme preuve. Comment régulariser et récupérer mes droits ?",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'structure',
  },
  {
    id: 'str-travail-4',
    label: 'Discrimination embauche',
    send: "J'ai postulé à un poste pour lequel j'avais toutes les qualifications. Après l'entretien, on m'a informé que le poste était réservé à un homme. J'ai les échanges email comme preuve de discrimination à l'embauche.",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'structure',
  },
  // Immobilier
  {
    id: 'str-immobilier-1',
    label: 'Locataire inexpulsable',
    send: "Mon locataire ne paie plus depuis 5 mois (soit 2 750 DT). Il refuse de quitter les lieux malgré ma mise en demeure. Le bail est expiré depuis janvier 2024. J'ai besoin de l'appartement pour y loger ma famille.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'structure',
  },
  {
    id: 'str-immobilier-2',
    label: 'Construction illégale voisin',
    send: "Mon voisin a construit un mur de 3 mètres à 50 cm de ma maison, sans permis et en empiétant de 80 cm sur mon terrain selon le cadastre. La municipalité n'intervient pas malgré mes plaintes. J'ai le titre foncier.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'structure',
  },
  {
    id: 'str-immobilier-3',
    label: 'Vente terre agricole',
    send: "J'ai vendu un terrain agricole à un acheteur. Il a payé les 2/3 du prix mais refuse de payer le reste en prétextant un vice caché. L'acte de vente est signé chez le notaire. Je veux annuler la vente ou récupérer le solde.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'structure',
  },
  {
    id: 'str-immobilier-4',
    label: 'Copropriété litigieuse',
    send: "Je suis propriétaire d'un appartement en copropriété. Le syndic prélève des charges excessives sans justificatif et refuse de convoquer l'assemblée générale depuis 2 ans. Les travaux votés n'ont jamais été réalisés.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'structure',
  },
  // Administratif
  {
    id: 'str-admin-1',
    label: 'Permis refusé',
    send: "La municipalité de Sousse a refusé mon permis de construire pour un projet résidentiel conforme au plan d'aménagement urbain. Le refus n'est pas motivé. Le terrain est constructible et je respecte tous les critères légaux.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'structure',
  },
  {
    id: 'str-admin-2',
    label: 'Mutation injuste',
    send: "Je suis fonctionnaire au ministère de l'éducation. J'ai été muté d'office à 300 km de mon domicile sans raison de service réelle. Ma femme est malade et je suis seul à m'en occuper. La décision est administrative.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'structure',
  },
  {
    id: 'str-admin-3',
    label: 'Expropriation terrain',
    send: "L'État a exproprié mon terrain pour la construction d'une route. L'indemnisation proposée est trois fois inférieure à la valeur du marché. J'ai refusé mais le tribunal a confirmé l'expropriation sans réévaluer le montant.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'structure',
  },
  {
    id: 'str-admin-4',
    label: 'Licenciement fonctionnaire',
    send: "Je suis agent de la fonction publique. J'ai été révoqué suite à une procédure disciplinaire que je conteste. Je n'ai pas été informé des charges retenues contre moi et je n'ai pas pu me défendre devant le conseil de discipline.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'structure',
  },
]

// ─── MODE : ariida (requête introductive) ─────────────────────────────────────

const ARIIDA_SUGGESTIONS: Suggestion[] = [
  // Famille
  {
    id: 'ari-famille-1',
    label: 'Requête divorce',
    send: "Je veux déposer une requête introductive d'instance en divorce pour préjudice. Mon époux m'a abandonnée il y a 8 mois et a cessé de subvenir aux besoins de la famille. Nous avons un enfant de 4 ans.",
    domain: 'famille',
    icon: 'users',
    mode: 'ariida',
  },
  {
    id: 'ari-famille-2',
    label: 'Action en pension',
    send: "Je souhaite déposer une requête pour obtenir une pension alimentaire pour mes enfants après séparation de fait. Le père ne participe plus aux charges depuis 6 mois. Je veux aussi une provision avant jugement.",
    domain: 'famille',
    icon: 'users',
    mode: 'ariida',
  },
  {
    id: 'ari-famille-3',
    label: 'Tutelle enfant',
    send: "Je veux demander au tribunal l'attribution de la tutelle légale de mon enfant. Son père est décédé sans désigner de tuteur et certains membres de la famille contestent mes droits en tant que mère.",
    domain: 'famille',
    icon: 'users',
    mode: 'ariida',
  },
  {
    id: 'ari-famille-4',
    label: 'Partage succession',
    send: "Je veux déposer une requête en partage de succession. Mon père est décédé il y a 2 ans. Nous sommes 4 héritiers mais mon frère aîné occupe l'immeuble successoral et bloque tout règlement depuis 18 mois.",
    domain: 'famille',
    icon: 'users',
    mode: 'ariida',
  },
  // Commercial
  {
    id: 'ari-commercial-1',
    label: 'Recouvrement créance',
    send: "Je veux déposer une requête en injonction de payer contre une société qui me doit 65 000 DT selon une facture acceptée et un bon de livraison signé. La créance est certaine, liquide et exigible.",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'ariida',
  },
  {
    id: 'ari-commercial-2',
    label: 'Résolution contrat',
    send: "Je veux former une requête en résolution du contrat de vente et restitution du prix. Le vendeur m'a livré une marchandise non conforme aux spécifications contractuelles. J'ai des expertises et photos à l'appui.",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'ariida',
  },
  {
    id: 'ari-commercial-3',
    label: 'Concurrence déloyale',
    send: "Je veux intenter une action en concurrence déloyale contre un ancien employé qui a créé une société concurrente et démarché mes clients en utilisant mes fichiers commerciaux confidentiels.",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'ariida',
  },
  {
    id: 'ari-commercial-4',
    label: 'Dissolution SARL',
    send: "Je veux déposer une requête en dissolution judiciaire de notre SARL. La mésentente entre associés paralyse toute décision depuis un an. Mon associé détient 50% et nous ne pouvons plus tenir d'assemblées.",
    domain: 'commercial',
    icon: 'briefcase',
    mode: 'ariida',
  },
  // Pénal
  {
    id: 'ari-penal-1',
    label: 'Constitution partie civile',
    send: "Je veux me constituer partie civile dans une affaire d'escroquerie dont je suis victime. Un individu m'a soutiré 30 000 DT sous prétexte d'un faux investissement. Le parquet a ouvert une information judiciaire.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'ariida',
  },
  {
    id: 'ari-penal-2',
    label: 'Plainte pour abus de confiance',
    send: "Je veux déposer une plainte avec constitution de partie civile pour abus de confiance. J'avais confié 20 000 DT en espèces à mon associé pour un achat immobilier commun. Il a utilisé les fonds à des fins personnelles.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'ariida',
  },
  {
    id: 'ari-penal-3',
    label: 'Action diffamation',
    send: "Je veux déposer plainte pour diffamation publique. Un concurrent a publié dans un journal local un article mensonger accusant mon restaurant d'infractions sanitaires, ce qui a entraîné une chute de 40% de mon chiffre d'affaires.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'ariida',
  },
  {
    id: 'ari-penal-4',
    label: 'Faux et usage de faux',
    send: "Je veux porter plainte pour faux et usage de faux. Un individu a falsifié ma signature sur un chèque de 12 000 DT et l'a encaissé. La banque a confirmé que la signature ne correspond pas à mon spécimen.",
    domain: 'pénal',
    icon: 'shield',
    mode: 'ariida',
  },
  // Travail
  {
    id: 'ari-travail-1',
    label: 'Requête licenciement',
    send: "Je veux saisir le tribunal du travail pour licenciement abusif. J'ai été licencié après 12 ans de service sans motif valable, sans procédure disciplinaire préalable et avec une indemnité inférieure aux minima légaux.",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'ariida',
  },
  {
    id: 'ari-travail-2',
    label: 'Rappel de salaire',
    send: "Je veux déposer une requête en rappel de salaire et heures supplémentaires. Mon employeur ne m'a pas versé 4 mois de salaire intégral et a refusé de payer les majorations légales pour heures supplémentaires effectuées.",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'ariida',
  },
  {
    id: 'ari-travail-3',
    label: 'Reconnaissance accident',
    send: "Je veux saisir le tribunal pour faire reconnaître l'accident du travail que mon employeur refuse de déclarer. J'ai des certificats médicaux, témoignages et photos. La CNAM me réclame des documents que seul l'employeur peut fournir.",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'ariida',
  },
  {
    id: 'ari-travail-4',
    label: 'Action syndicale',
    send: "Je veux intenter une action pour discrimination syndicale. Depuis mon élection comme délégué du personnel, mon employeur m'a retiré mes responsabilités, réduit ma prime et m'impose les horaires les plus défavorables.",
    domain: 'travail',
    icon: 'hard-hat',
    mode: 'ariida',
  },
  // Immobilier
  {
    id: 'ari-immobilier-1',
    label: 'Expulsion locataire',
    send: "Je veux déposer une requête en expulsion de mon locataire pour défaut de paiement et occupation sans droit. Le bail a expiré il y a 3 mois, les loyers impayés s'élèvent à 3 500 DT et je dois l'appartement pour cause personnelle.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'ariida',
  },
  {
    id: 'ari-immobilier-2',
    label: 'Annulation vente',
    send: "Je veux former une requête en annulation d'un contrat de vente immobilière pour vice du consentement. L'agent immobilier m'a dissimulé un contentieux judiciaire sur le titre foncier que j'ai découvert après signature.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'ariida',
  },
  {
    id: 'ari-immobilier-3',
    label: 'Bornage judiciaire',
    send: "Je veux demander un bornage judiciaire de mon terrain. Mon voisin conteste les limites et a déplacé les bornes. Nous n'arrivons pas à nous accorder sur un géomètre privé et le litige dure depuis 2 ans.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'ariida',
  },
  {
    id: 'ari-immobilier-4',
    label: 'Action en garantie vices',
    send: "Je veux intenter une action en garantie pour vices cachés contre le vendeur de mon appartement. Six mois après l'achat, j'ai découvert des infiltrations d'eau structurelles que le vendeur connaissait et m'a dissimulées.",
    domain: 'immobilier',
    icon: 'home',
    mode: 'ariida',
  },
  // Administratif
  {
    id: 'ari-admin-1',
    label: 'Recours annulation',
    send: "Je veux former un recours en annulation devant le tribunal administratif. La commune a accordé un permis de construire à mon voisin en violation du plan d'aménagement de détail. Ce permis affecte directement mon droit à la vue et à l'ensoleillement.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'ariida',
  },
  {
    id: 'ari-admin-2',
    label: 'Recours avancement',
    send: "Je veux contester une décision administrative refusant mon avancement à l'ancienneté. Je remplis toutes les conditions légales mais ma demande a été bloquée par mon directeur régional pour des raisons apparemment personnelles.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'ariida',
  },
  {
    id: 'ari-admin-3',
    label: 'Responsabilité État',
    send: "Je veux engager la responsabilité de l'État suite à un accident causé par un véhicule administratif non assuré. J'ai été hospitalisé 3 semaines et garde des séquelles permanentes. Le chauffeur était en service.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'ariida',
  },
  {
    id: 'ari-admin-4',
    label: 'Sursis à exécution',
    send: "Je veux demander en urgence le sursis à exécution d'une décision administrative. L'administration veut démolir mon bâtiment dans 48h pour « danger public » alors que je viens d'obtenir un rapport d'expert attestant de sa solidité.",
    domain: 'administratif',
    icon: 'landmark',
    mode: 'ariida',
  },
]

// ─── Données combinées ────────────────────────────────────────────────────────

export const ALL_SUGGESTIONS: Suggestion[] = [
  ...CHAT_SUGGESTIONS,
  ...STRUCTURE_SUGGESTIONS,
  ...ARIIDA_SUGGESTIONS,
]

export function getSuggestions(mode: SuggestionMode, domain?: SuggestionDomain | 'all'): Suggestion[] {
  const byMode = ALL_SUGGESTIONS.filter((s) => s.mode === mode)
  if (!domain || domain === 'all') return byMode
  return byMode.filter((s) => s.domain === domain)
}

export function getDefaultSuggestions(mode: SuggestionMode, count = 4): Suggestion[] {
  // Retourner une suggestion par domaine en rotation
  const domains: SuggestionDomain[] = ['famille', 'commercial', 'pénal', 'travail', 'immobilier', 'administratif']
  const byMode = ALL_SUGGESTIONS.filter((s) => s.mode === mode)
  const picks: Suggestion[] = []
  for (const domain of domains) {
    const found = byMode.find((s) => s.domain === domain)
    if (found) picks.push(found)
    if (picks.length >= count) break
  }
  return picks
}

export const ALL_DOMAINS: SuggestionDomain[] = [
  'famille',
  'commercial',
  'pénal',
  'travail',
  'immobilier',
  'administratif',
]
