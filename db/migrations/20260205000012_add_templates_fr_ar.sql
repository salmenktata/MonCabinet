-- Migration : Ajouter templates juridiques supplémentaires (FR + AR)
-- Date : 2026-02-05
-- Description : Ajout de templates bilingues pour avocats tunisiens

-- 4. Requête (FR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'Requête en matière civile',
  'Modèle de requête devant le tribunal',
  'requete',
  E'TRIBUNAL DE {{tribunal}}

REQUÊTE

L''an {{annee}}, le {{date}}

À Monsieur le Président du Tribunal de {{tribunal}}

{{demandeur.civilite}} {{demandeur.nom}} {{demandeur.prenom}}
Demeurant à {{demandeur.adresse}}
CIN n° {{demandeur.cin}}

Ayant pour avocat :
Maître {{avocat.nom}} {{avocat.prenom}}
Inscrit au Barreau de {{barreau}}

A l''honneur de vous exposer que :

EXPOSÉ DES FAITS :

{{expose_faits}}

PRÉTENTIONS :

{{pretentions}}

MOYENS DE DROIT :

{{moyens_droit}}

PAR CES MOTIFS,

Il vous plaira,

{{dispositif}}

Fait à {{lieu}}, le {{date}}

Me {{avocat.nom}}
Avocat',
  '["tribunal", "annee", "date", "demandeur.civilite", "demandeur.nom", "demandeur.prenom", "demandeur.adresse", "demandeur.cin", "avocat.nom", "avocat.prenom", "barreau", "expose_faits", "pretentions", "moyens_droit", "dispositif", "lieu"]'::jsonb,
  true
);

-- 5. Requête (AR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'مطلب في المادة المدنية',
  'نموذج مطلب أمام المحكمة',
  'requete',
  E'محكمة {{tribunal_ar}}

مطلب

سنة {{annee_ar}}، بتاريخ {{date_ar}}

إلى السيد رئيس محكمة {{tribunal_ar}}

{{demandeur_civilite_ar}} {{demandeur_nom_ar}} {{demandeur_prenom_ar}}
المقيم ب {{demandeur_adresse_ar}}
بطاقة تعريف وطنية عدد {{demandeur_cin}}

وكيله :
الأستاذ {{avocat_nom_ar}} {{avocat_prenom_ar}}
المحامي لدى هيئة المحامين ب{{barreau_ar}}

يتشرف بعرض ما يلي :

عرض الوقائع :

{{expose_faits_ar}}

المطالب :

{{pretentions_ar}}

الوسائل القانونية :

{{moyens_droit_ar}}

لهذه الأسباب،

يرجى التفضل،

{{dispositif_ar}}

حرر ب{{lieu_ar}}، بتاريخ {{date_ar}}

الأستاذ {{avocat_nom_ar}}
محامي',
  '["tribunal_ar", "annee_ar", "date_ar", "demandeur_civilite_ar", "demandeur_nom_ar", "demandeur_prenom_ar", "demandeur_adresse_ar", "demandeur_cin", "avocat_nom_ar", "avocat_prenom_ar", "barreau_ar", "expose_faits_ar", "pretentions_ar", "moyens_droit_ar", "dispositif_ar", "lieu_ar"]'::jsonb,
  true
);

-- 6. Conclusions du demandeur (FR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'Conclusions du demandeur',
  'Modèle de conclusions pour le demandeur',
  'conclusions_demandeur',
  E'TRIBUNAL DE {{tribunal}}

Dossier n° {{numero_dossier}}

CONCLUSIONS POUR LE DEMANDEUR

POUR :
{{demandeur.nom}} {{demandeur.prenom}}
Demeurant à {{demandeur.adresse}}

Ayant pour avocat :
Me {{avocat.nom}} {{avocat.prenom}}
Barreau de {{barreau}}

CONTRE :
{{defendeur.nom}} {{defendeur.prenom}}
Demeurant à {{defendeur.adresse}}

PLAISE AU TRIBUNAL,

RAPPEL DES FAITS :

{{rappel_faits}}

EN DROIT :

{{moyens_droit}}

SUR LES DEMANDES :

{{demandes}}

PAR CES MOTIFS,

Le demandeur conclut à ce qu''il plaise au Tribunal :

{{conclusions}}

Sous toutes réserves de droit.

Me {{avocat.nom}}
Avocat du demandeur',
  '["tribunal", "numero_dossier", "demandeur.nom", "demandeur.prenom", "demandeur.adresse", "avocat.nom", "avocat.prenom", "barreau", "defendeur.nom", "defendeur.prenom", "defendeur.adresse", "rappel_faits", "moyens_droit", "demandes", "conclusions"]'::jsonb,
  true
);

-- 7. Conclusions du demandeur (AR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'مرافعات المدعي',
  'نموذج مرافعات للمدعي',
  'conclusions_demandeur',
  E'محكمة {{tribunal_ar}}

ملف عدد {{numero_dossier}}

مرافعات المدعي

عن :
{{demandeur_nom_ar}} {{demandeur_prenom_ar}}
المقيم ب {{demandeur_adresse_ar}}

وكيله :
الأستاذ {{avocat_nom_ar}} {{avocat_prenom_ar}}
المحامي لدى هيئة {{barreau_ar}}

ضد :
{{defendeur_nom_ar}} {{defendeur_prenom_ar}}
المقيم ب {{defendeur_adresse_ar}}

يُرجى من المحكمة،

تذكير بالوقائع :

{{rappel_faits_ar}}

من حيث القانون :

{{moyens_droit_ar}}

بخصوص المطالب :

{{demandes_ar}}

لهذه الأسباب،

يلتمس المدعي الحكم له :

{{conclusions_ar}}

مع حفظ كافة الحقوق.

الأستاذ {{avocat_nom_ar}}
وكيل المدعي',
  '["tribunal_ar", "numero_dossier", "demandeur_nom_ar", "demandeur_prenom_ar", "demandeur_adresse_ar", "avocat_nom_ar", "avocat_prenom_ar", "barreau_ar", "defendeur_nom_ar", "defendeur_prenom_ar", "defendeur_adresse_ar", "rappel_faits_ar", "moyens_droit_ar", "demandes_ar", "conclusions_ar"]'::jsonb,
  true
);

-- 8. Conclusions du défenseur (FR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'Conclusions du défenseur',
  'Modèle de conclusions pour le défenseur',
  'conclusions_defenseur',
  E'TRIBUNAL DE {{tribunal}}

Dossier n° {{numero_dossier}}

CONCLUSIONS POUR LE DÉFENSEUR

POUR :
{{defendeur.nom}} {{defendeur.prenom}}
Demeurant à {{defendeur.adresse}}

Ayant pour avocat :
Me {{avocat.nom}} {{avocat.prenom}}
Barreau de {{barreau}}

CONTRE :
{{demandeur.nom}} {{demandeur.prenom}}
Demeurant à {{demandeur.adresse}}

PLAISE AU TRIBUNAL,

EN LA FORME :

{{moyen_forme}}

AU FOND :

RAPPEL DES FAITS :

{{rappel_faits}}

RÉPONSE AUX PRÉTENTIONS DU DEMANDEUR :

{{reponse_pretentions}}

EN DROIT :

{{moyens_droit}}

PAR CES MOTIFS,

Le défenseur conclut à ce qu''il plaise au Tribunal :

{{conclusions}}

Sous toutes réserves de droit.

Me {{avocat.nom}}
Avocat du défenseur',
  '["tribunal", "numero_dossier", "defendeur.nom", "defendeur.prenom", "defendeur.adresse", "avocat.nom", "avocat.prenom", "barreau", "demandeur.nom", "demandeur.prenom", "demandeur.adresse", "moyen_forme", "rappel_faits", "reponse_pretentions", "moyens_droit", "conclusions"]'::jsonb,
  true
);

-- 9. Conclusions du défenseur (AR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'مرافعات المدعى عليه',
  'نموذج مرافعات للمدعى عليه',
  'conclusions_defenseur',
  E'محكمة {{tribunal_ar}}

ملف عدد {{numero_dossier}}

مرافعات المدعى عليه

عن :
{{defendeur_nom_ar}} {{defendeur_prenom_ar}}
المقيم ب {{defendeur_adresse_ar}}

وكيله :
الأستاذ {{avocat_nom_ar}} {{avocat_prenom_ar}}
المحامي لدى هيئة {{barreau_ar}}

ضد :
{{demandeur_nom_ar}} {{demandeur_prenom_ar}}
المقيم ب {{demandeur_adresse_ar}}

يُرجى من المحكمة،

من حيث الشكل :

{{moyen_forme_ar}}

من حيث الموضوع :

تذكير بالوقائع :

{{rappel_faits_ar}}

الرد على مطالب المدعي :

{{reponse_pretentions_ar}}

من حيث القانون :

{{moyens_droit_ar}}

لهذه الأسباب،

يلتمس المدعى عليه الحكم :

{{conclusions_ar}}

مع حفظ كافة الحقوق.

الأستاذ {{avocat_nom_ar}}
وكيل المدعى عليه',
  '["tribunal_ar", "numero_dossier", "defendeur_nom_ar", "defendeur_prenom_ar", "defendeur_adresse_ar", "avocat_nom_ar", "avocat_prenom_ar", "barreau_ar", "demandeur_nom_ar", "demandeur_prenom_ar", "demandeur_adresse_ar", "moyen_forme_ar", "rappel_faits_ar", "reponse_pretentions_ar", "moyens_droit_ar", "conclusions_ar"]'::jsonb,
  true
);

-- 10. Convention d'honoraires ONAT (FR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'Convention d''honoraires (ONAT)',
  'Convention conforme aux normes ONAT',
  'autre',
  E'CONVENTION D''HONORAIRES

Entre :

Maître {{avocat.nom}} {{avocat.prenom}}
Avocat inscrit au Barreau de {{barreau}}
Matricule ONAT : {{matricule_onat}}
Cabinet sis à {{cabinet.adresse}}
{{cabinet.telephone}}
{{cabinet.email}}

Ci-après dénommé « L''Avocat »

D''une part,

Et :

{{client.civilite}} {{client.nom}} {{client.prenom}}
Né(e) le {{client.date_naissance}}
Demeurant à {{client.adresse}}
CIN n° {{client.cin}}
Téléphone : {{client.telephone}}

Ci-après dénommé « Le Client »

D''autre part,

IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :

ARTICLE 1 - OBJET DE LA MISSION

L''Avocat s''engage à assister et représenter le Client dans l''affaire suivante :

{{objet_mission}}

ARTICLE 2 - HONORAIRES

Les honoraires sont fixés à {{montant_honoraires}} TND ({{montant_lettres}} dinars tunisiens).

Mode de règlement : {{mode_reglement}}

ARTICLE 3 - FRAIS ET DÉBOURS

Les frais de justice, taxes et débours restent à la charge du Client.

ARTICLE 4 - DURÉE

La présente convention prend effet à compter du {{date_debut}} et se poursuivra jusqu''à la fin de la mission.

ARTICLE 5 - OBLIGATIONS DE L''AVOCAT

L''Avocat s''engage à :
- Assurer la défense des intérêts du Client avec diligence
- Respecter le secret professionnel
- Informer régulièrement le Client

ARTICLE 6 - OBLIGATIONS DU CLIENT

Le Client s''engage à :
- Fournir tous documents et informations nécessaires
- Régler les honoraires convenus
- Informer l''Avocat de tout changement

Fait à {{lieu}}, le {{date}}
En deux exemplaires originaux

Le Client                          L''Avocat
{{client.nom}}                    Me {{avocat.nom}}',
  '["avocat.nom", "avocat.prenom", "barreau", "matricule_onat", "cabinet.adresse", "cabinet.telephone", "cabinet.email", "client.civilite", "client.nom", "client.prenom", "client.date_naissance", "client.adresse", "client.cin", "client.telephone", "objet_mission", "montant_honoraires", "montant_lettres", "mode_reglement", "date_debut", "lieu", "date"]'::jsonb,
  true
);

-- 11. Convention d'honoraires ONAT (AR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'اتفاقية أتعاب (منظمة المحامين)',
  'اتفاقية مطابقة لمعايير منظمة المحامين التونسيين',
  'autre',
  E'اتفاقية أتعاب

بين :

الأستاذ {{avocat_nom_ar}} {{avocat_prenom_ar}}
المحامي المسجل لدى هيئة المحامين ب{{barreau_ar}}
رقم التسجيل بمنظمة المحامين : {{matricule_onat}}
مقر المكتب : {{cabinet_adresse_ar}}
هاتف : {{cabinet_telephone}}
البريد الإلكتروني : {{cabinet_email}}

المشار إليه ب « المحامي »

من جهة،

و :

{{client_civilite_ar}} {{client_nom_ar}} {{client_prenom_ar}}
المولود(ة) بتاريخ {{client_date_naissance_ar}}
المقيم(ة) ب {{client_adresse_ar}}
بطاقة تعريف وطنية عدد {{client_cin}}
هاتف : {{client_telephone}}

المشار إليه ب « الموكل »

من جهة أخرى،

تم الاتفاق على ما يلي :

الفصل 1 - موضوع المهمة

يتعهد المحامي بمساعدة و تمثيل الموكل في القضية التالية :

{{objet_mission_ar}}

الفصل 2 - الأتعاب

حُددت الأتعاب ب {{montant_honoraires}} دينار تونسي ({{montant_lettres_ar}}).

طريقة الدفع : {{mode_reglement_ar}}

الفصل 3 - المصاريف

تبقى مصاريف العدالة و الرسوم و المصاريف الأخرى على عهدة الموكل.

الفصل 4 - المدة

تدخل هذه الاتفاقية حيز التنفيذ ابتداء من {{date_debut_ar}} و تستمر إلى نهاية المهمة.

الفصل 5 - التزامات المحامي

يتعهد المحامي ب :
- الدفاع عن مصالح الموكل بكل عناية
- احترام السر المهني
- إعلام الموكل بصفة منتظمة

الفصل 6 - التزامات الموكل

يتعهد الموكل ب :
- تقديم جميع الوثائق و المعلومات الضرورية
- دفع الأتعاب المتفق عليها
- إعلام المحامي بأي تغيير

حرر ب{{lieu_ar}}، بتاريخ {{date_ar}}
في نسختين أصليتين

الموكل                          المحامي
{{client_nom_ar}}              الأستاذ {{avocat_nom_ar}}',
  '["avocat_nom_ar", "avocat_prenom_ar", "barreau_ar", "matricule_onat", "cabinet_adresse_ar", "cabinet_telephone", "cabinet_email", "client_civilite_ar", "client_nom_ar", "client_prenom_ar", "client_date_naissance_ar", "client_adresse_ar", "client_cin", "client_telephone", "objet_mission_ar", "montant_honoraires", "montant_lettres_ar", "mode_reglement_ar", "date_debut_ar", "lieu_ar", "date_ar"]'::jsonb,
  true
);

-- 12. Procuration (FR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'Procuration générale',
  'Modèle de procuration',
  'procuration',
  E'PROCURATION

Je soussigné(e) :

{{mandant.civilite}} {{mandant.nom}} {{mandant.prenom}}
Né(e) le {{mandant.date_naissance}} à {{mandant.lieu_naissance}}
Demeurant à {{mandant.adresse}}
CIN n° {{mandant.cin}}

Donne par la présente procuration à :

{{mandataire.civilite}} {{mandataire.nom}} {{mandataire.prenom}}
Demeurant à {{mandataire.adresse}}
CIN n° {{mandataire.cin}}

Tous pouvoirs pour :

{{pouvoirs}}

En conséquence, mon mandataire pourra :
- Signer tous actes et documents
- Effectuer toutes démarches nécessaires
- Me représenter auprès de toutes administrations
- Généralement faire tout ce qui sera nécessaire

La présente procuration est valable pour une durée de {{duree}} mois à compter de ce jour.

Fait à {{lieu}}, le {{date}}

Le mandant                      Le mandataire
{{mandant.nom}}                {{mandataire.nom}}

(Signature légalisée)',
  '["mandant.civilite", "mandant.nom", "mandant.prenom", "mandant.date_naissance", "mandant.lieu_naissance", "mandant.adresse", "mandant.cin", "mandataire.civilite", "mandataire.nom", "mandataire.prenom", "mandataire.adresse", "mandataire.cin", "pouvoirs", "duree", "lieu", "date"]'::jsonb,
  true
);

-- 13. Procuration (AR)
INSERT INTO templates (user_id, titre, description, type_document, contenu, variables, est_public) VALUES
(
  NULL,
  'وكالة عامة',
  'نموذج وكالة',
  'procuration',
  E'وكـــالــة

أنا الممضي(ة) أسفله :

{{mandant_civilite_ar}} {{mandant_nom_ar}} {{mandant_prenom_ar}}
المولود(ة) بتاريخ {{mandant_date_naissance_ar}} ب {{mandant_lieu_naissance_ar}}
المقيم(ة) ب {{mandant_adresse_ar}}
بطاقة تعريف وطنية عدد {{mandant_cin}}

أوكل بموجب هذه الوكالة :

{{mandataire_civilite_ar}} {{mandataire_nom_ar}} {{mandataire_prenom_ar}}
المقيم ب {{mandataire_adresse_ar}}
بطاقة تعريف وطنية عدد {{mandataire_cin}}

كامل الصلاحيات ل :

{{pouvoirs_ar}}

بناء عليه، يمكن لوكيلي :
- التوقيع على جميع العقود و الوثائق
- القيام بجميع الإجراءات الضرورية
- تمثيلي لدى جميع الإدارات
- عموما القيام بكل ما هو ضروري

هذه الوكالة صالحة لمدة {{duree}} شهر ابتداء من هذا اليوم.

حرر ب {{lieu_ar}}، بتاريخ {{date_ar}}

الموكّل                          الوكيل
{{mandant_nom_ar}}            {{mandataire_nom_ar}}

(توقيع مصادق عليه)',
  '["mandant_civilite_ar", "mandant_nom_ar", "mandant_prenom_ar", "mandant_date_naissance_ar", "mandant_lieu_naissance_ar", "mandant_adresse_ar", "mandant_cin", "mandataire_civilite_ar", "mandataire_nom_ar", "mandataire_prenom_ar", "mandataire_adresse_ar", "mandataire_cin", "pouvoirs_ar", "duree", "lieu_ar", "date_ar"]'::jsonb,
  true
);

COMMENT ON COLUMN templates.titre IS 'Titre du template (bilingue FR/AR supporté)';
