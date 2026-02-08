--
-- PostgreSQL database dump
--

\restrict XANOlCiF7Jsm6jwfNi7M8GJp6BtoP4sBKJ6MeyiGHrvG6qPitoufFwv5TawweXI

-- Dumped from database version 15.15 (Debian 15.15-1.pgdg12+1)
-- Dumped by pg_dump version 15.15 (Debian 15.15-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.web_sources DROP CONSTRAINT IF EXISTS web_sources_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.web_source_ban_status DROP CONSTRAINT IF EXISTS web_source_ban_status_web_source_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_pages DROP CONSTRAINT IF EXISTS web_pages_web_source_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_pages DROP CONSTRAINT IF EXISTS web_pages_knowledge_base_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_page_versions DROP CONSTRAINT IF EXISTS web_page_versions_web_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_page_structured_metadata DROP CONSTRAINT IF EXISTS web_page_structured_metadata_web_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_files DROP CONSTRAINT IF EXISTS web_files_web_source_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_files DROP CONSTRAINT IF EXISTS web_files_web_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_files DROP CONSTRAINT IF EXISTS web_files_knowledge_base_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_crawl_logs DROP CONSTRAINT IF EXISTS web_crawl_logs_web_source_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_crawl_logs DROP CONSTRAINT IF EXISTS web_crawl_logs_job_id_fkey;
ALTER TABLE IF EXISTS ONLY public.web_crawl_jobs DROP CONSTRAINT IF EXISTS web_crawl_jobs_web_source_id_fkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_approved_by_fkey;
ALTER TABLE IF EXISTS ONLY public.user_activity_logs DROP CONSTRAINT IF EXISTS user_activity_logs_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.time_entries DROP CONSTRAINT IF EXISTS time_entries_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.time_entries DROP CONSTRAINT IF EXISTS time_entries_dossier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.templates DROP CONSTRAINT IF EXISTS templates_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.source_classification_rules DROP CONSTRAINT IF EXISTS source_classification_rules_web_source_id_fkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.pending_documents DROP CONSTRAINT IF EXISTS pending_documents_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.messaging_webhooks_config DROP CONSTRAINT IF EXISTS messaging_webhooks_config_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.legal_taxonomy DROP CONSTRAINT IF EXISTS legal_taxonomy_parent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.legal_classifications DROP CONSTRAINT IF EXISTS legal_classifications_web_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.legal_classifications DROP CONSTRAINT IF EXISTS legal_classifications_validated_by_fkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_parent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base_versions DROP CONSTRAINT IF EXISTS knowledge_base_versions_knowledge_base_id_fkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base_versions DROP CONSTRAINT IF EXISTS knowledge_base_versions_changed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_uploaded_by_fkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base_chunks DROP CONSTRAINT IF EXISTS knowledge_base_chunks_knowledge_base_id_fkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_bulk_import_id_fkey;
ALTER TABLE IF EXISTS ONLY public.kb_document_relations DROP CONSTRAINT IF EXISTS kb_document_relations_target_document_id_fkey;
ALTER TABLE IF EXISTS ONLY public.kb_document_relations DROP CONSTRAINT IF EXISTS kb_document_relations_source_document_id_fkey;
ALTER TABLE IF EXISTS ONLY public.kb_document_relations DROP CONSTRAINT IF EXISTS kb_document_relations_reviewed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.kb_bulk_imports DROP CONSTRAINT IF EXISTS kb_bulk_imports_uploaded_by_fkey;
ALTER TABLE IF EXISTS ONLY public.human_review_queue DROP CONSTRAINT IF EXISTS human_review_queue_completed_by_fkey;
ALTER TABLE IF EXISTS ONLY public.human_review_queue DROP CONSTRAINT IF EXISTS human_review_queue_assigned_to_fkey;
ALTER TABLE IF EXISTS ONLY public.flouci_transactions DROP CONSTRAINT IF EXISTS flouci_transactions_facture_id_fkey;
ALTER TABLE IF EXISTS ONLY public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.factures DROP CONSTRAINT IF EXISTS factures_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.factures DROP CONSTRAINT IF EXISTS factures_dossier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.factures DROP CONSTRAINT IF EXISTS factures_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.echeances DROP CONSTRAINT IF EXISTS echeances_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.echeances DROP CONSTRAINT IF EXISTS echeances_dossier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.dossiers DROP CONSTRAINT IF EXISTS dossiers_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.dossiers DROP CONSTRAINT IF EXISTS dossiers_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_dossier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.document_embeddings DROP CONSTRAINT IF EXISTS document_embeddings_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.document_embeddings DROP CONSTRAINT IF EXISTS document_embeddings_document_id_fkey;
ALTER TABLE IF EXISTS ONLY public.crawler_health_metrics DROP CONSTRAINT IF EXISTS crawler_health_metrics_web_source_id_fkey;
ALTER TABLE IF EXISTS ONLY public.content_quality_assessments DROP CONSTRAINT IF EXISTS content_quality_assessments_web_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.content_contradictions DROP CONSTRAINT IF EXISTS content_contradictions_target_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.content_contradictions DROP CONSTRAINT IF EXISTS content_contradictions_source_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.content_contradictions DROP CONSTRAINT IF EXISTS content_contradictions_resolved_by_fkey;
ALTER TABLE IF EXISTS ONLY public.cloud_providers_config DROP CONSTRAINT IF EXISTS cloud_providers_config_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.classification_learning_log DROP CONSTRAINT IF EXISTS classification_learning_log_rule_id_fkey;
ALTER TABLE IF EXISTS ONLY public.classification_learning_log DROP CONSTRAINT IF EXISTS classification_learning_log_learned_from_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.classification_learning_log DROP CONSTRAINT IF EXISTS classification_learning_log_learned_by_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.classification_corrections DROP CONSTRAINT IF EXISTS classification_corrections_web_page_id_fkey;
ALTER TABLE IF EXISTS ONLY public.classification_corrections DROP CONSTRAINT IF EXISTS classification_corrections_generated_rule_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_dossier_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_read_by_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_actioned_by_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_admin_id_fkey;
ALTER TABLE IF EXISTS ONLY public.actions DROP CONSTRAINT IF EXISTS actions_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.actions DROP CONSTRAINT IF EXISTS actions_dossier_id_fkey;
DROP TRIGGER IF EXISTS update_web_sources_updated_at ON public.web_sources;
DROP TRIGGER IF EXISTS update_web_pages_updated_at ON public.web_pages;
DROP TRIGGER IF EXISTS update_review_queue_updated_at ON public.human_review_queue;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_knowledge_base_updated_at ON public.knowledge_base;
DROP TRIGGER IF EXISTS update_jurisprudence_updated_at ON public.jurisprudence;
DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON public.feature_flags;
DROP TRIGGER IF EXISTS update_factures_updated_at ON public.factures;
DROP TRIGGER IF EXISTS update_echeances_updated_at ON public.echeances;
DROP TRIGGER IF EXISTS update_dossiers_updated_at ON public.dossiers;
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
DROP TRIGGER IF EXISTS update_contradictions_updated_at ON public.content_contradictions;
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON public.chat_conversations;
DROP TRIGGER IF EXISTS update_actions_updated_at ON public.actions;
DROP TRIGGER IF EXISTS trigger_user_status_transition ON public.users;
DROP TRIGGER IF EXISTS trigger_update_jurisprudence_stats ON public.jurisprudence;
DROP TRIGGER IF EXISTS trigger_update_crawler_success_rate ON public.crawler_health_metrics;
DROP TRIGGER IF EXISTS trigger_platform_config_updated ON public.platform_config;
DROP TRIGGER IF EXISTS trigger_notify_plan_expiring ON public.users;
DROP TRIGGER IF EXISTS trigger_notify_new_registration ON public.users;
DROP TRIGGER IF EXISTS protect_super_admin ON public.users;
DROP INDEX IF EXISTS public.idx_web_sources_next_crawl;
DROP INDEX IF EXISTS public.idx_web_sources_health;
DROP INDEX IF EXISTS public.idx_web_sources_category;
DROP INDEX IF EXISTS public.idx_web_sources_auto_crawl;
DROP INDEX IF EXISTS public.idx_web_source_ban_status_source_id;
DROP INDEX IF EXISTS public.idx_web_source_ban_status_is_banned;
DROP INDEX IF EXISTS public.idx_web_pages_status;
DROP INDEX IF EXISTS public.idx_web_pages_source;
DROP INDEX IF EXISTS public.idx_web_pages_site_structure;
DROP INDEX IF EXISTS public.idx_web_pages_requires_review;
DROP INDEX IF EXISTS public.idx_web_pages_quality_score;
DROP INDEX IF EXISTS public.idx_web_pages_processing_status;
DROP INDEX IF EXISTS public.idx_web_pages_kb_id;
DROP INDEX IF EXISTS public.idx_web_pages_fts;
DROP INDEX IF EXISTS public.idx_web_pages_freshness;
DROP INDEX IF EXISTS public.idx_web_pages_content_hash;
DROP INDEX IF EXISTS public.idx_web_page_versions_page_version;
DROP INDEX IF EXISTS public.idx_web_page_versions_page;
DROP INDEX IF EXISTS public.idx_web_page_metadata_type;
DROP INDEX IF EXISTS public.idx_web_page_metadata_tribunal;
DROP INDEX IF EXISTS public.idx_web_page_metadata_page;
DROP INDEX IF EXISTS public.idx_web_page_metadata_date;
DROP INDEX IF EXISTS public.idx_web_files_type;
DROP INDEX IF EXISTS public.idx_web_files_source;
DROP INDEX IF EXISTS public.idx_web_files_pending;
DROP INDEX IF EXISTS public.idx_web_files_page;
DROP INDEX IF EXISTS public.idx_web_files_kb;
DROP INDEX IF EXISTS public.idx_users_status;
DROP INDEX IF EXISTS public.idx_users_role;
DROP INDEX IF EXISTS public.idx_users_plan;
DROP INDEX IF EXISTS public.idx_users_last_login;
DROP INDEX IF EXISTS public.idx_users_email;
DROP INDEX IF EXISTS public.idx_users_approved_by;
DROP INDEX IF EXISTS public.idx_user_activity_user_id;
DROP INDEX IF EXISTS public.idx_user_activity_user_email;
DROP INDEX IF EXISTS public.idx_user_activity_user_date;
DROP INDEX IF EXISTS public.idx_user_activity_resource_type;
DROP INDEX IF EXISTS public.idx_user_activity_resource_id;
DROP INDEX IF EXISTS public.idx_user_activity_created_at;
DROP INDEX IF EXISTS public.idx_user_activity_audit;
DROP INDEX IF EXISTS public.idx_user_activity_action;
DROP INDEX IF EXISTS public.idx_time_entries_user_id;
DROP INDEX IF EXISTS public.idx_templates_user_id;
DROP INDEX IF EXISTS public.idx_templates_type;
DROP INDEX IF EXISTS public.idx_templates_public;
DROP INDEX IF EXISTS public.idx_templates_langue;
DROP INDEX IF EXISTS public.idx_rules_web_source;
DROP INDEX IF EXISTS public.idx_review_queue_type;
DROP INDEX IF EXISTS public.idx_review_queue_target;
DROP INDEX IF EXISTS public.idx_review_queue_pending;
DROP INDEX IF EXISTS public.idx_review_queue_assigned;
DROP INDEX IF EXISTS public.idx_quality_assessments_score;
DROP INDEX IF EXISTS public.idx_quality_assessments_requires_review;
DROP INDEX IF EXISTS public.idx_platform_config_key;
DROP INDEX IF EXISTS public.idx_platform_config_category;
DROP INDEX IF EXISTS public.idx_notification_preferences_user_id;
DROP INDEX IF EXISTS public.idx_legal_classifications_source;
DROP INDEX IF EXISTS public.idx_legal_classifications_signals;
DROP INDEX IF EXISTS public.idx_legal_classifications_requires_validation;
DROP INDEX IF EXISTS public.idx_legal_classifications_domain;
DROP INDEX IF EXISTS public.idx_legal_classifications_confidence;
DROP INDEX IF EXISTS public.idx_legal_classifications_category;
DROP INDEX IF EXISTS public.idx_learning_log_rule;
DROP INDEX IF EXISTS public.idx_learning_log_date;
DROP INDEX IF EXISTS public.idx_knowledge_base_vector;
DROP INDEX IF EXISTS public.idx_knowledge_base_language;
DROP INDEX IF EXISTS public.idx_knowledge_base_indexed;
DROP INDEX IF EXISTS public.idx_knowledge_base_fulltext;
DROP INDEX IF EXISTS public.idx_knowledge_base_chunks_vector;
DROP INDEX IF EXISTS public.idx_knowledge_base_chunks_kb_index;
DROP INDEX IF EXISTS public.idx_knowledge_base_chunks_kb_id;
DROP INDEX IF EXISTS public.idx_knowledge_base_category;
DROP INDEX IF EXISTS public.idx_kb_versions_doc_version;
DROP INDEX IF EXISTS public.idx_kb_versions_doc;
DROP INDEX IF EXISTS public.idx_kb_versions_changed_by;
DROP INDEX IF EXISTS public.idx_kb_versions_changed_at;
DROP INDEX IF EXISTS public.idx_kb_tags;
DROP INDEX IF EXISTS public.idx_kb_subcategory;
DROP INDEX IF EXISTS public.idx_kb_relations_type;
DROP INDEX IF EXISTS public.idx_kb_relations_target;
DROP INDEX IF EXISTS public.idx_kb_relations_status;
DROP INDEX IF EXISTS public.idx_kb_relations_source;
DROP INDEX IF EXISTS public.idx_kb_relations_severity;
DROP INDEX IF EXISTS public.idx_kb_quality_score;
DROP INDEX IF EXISTS public.idx_kb_quality_requires_review;
DROP INDEX IF EXISTS public.idx_kb_category_subcategory;
DROP INDEX IF EXISTS public.idx_kb_bulk_imports_user;
DROP INDEX IF EXISTS public.idx_kb_bulk_imports_status;
DROP INDEX IF EXISTS public.idx_kb_bulk_import_ref;
DROP INDEX IF EXISTS public.idx_kb_active;
DROP INDEX IF EXISTS public.idx_jurisprudence_keywords;
DROP INDEX IF EXISTS public.idx_jurisprudence_fulltext;
DROP INDEX IF EXISTS public.idx_jurisprudence_embedding;
DROP INDEX IF EXISTS public.idx_jurisprudence_domain;
DROP INDEX IF EXISTS public.idx_jurisprudence_decision_number;
DROP INDEX IF EXISTS public.idx_jurisprudence_date;
DROP INDEX IF EXISTS public.idx_jurisprudence_court;
DROP INDEX IF EXISTS public.idx_jurisprudence_chamber;
DROP INDEX IF EXISTS public.idx_jurisprudence_articles;
DROP INDEX IF EXISTS public.idx_indexing_jobs_target;
DROP INDEX IF EXISTS public.idx_indexing_jobs_pending;
DROP INDEX IF EXISTS public.idx_indexing_jobs_completed;
DROP INDEX IF EXISTS public.idx_feature_flags_user;
DROP INDEX IF EXISTS public.idx_factures_user_id;
DROP INDEX IF EXISTS public.idx_factures_fulltext;
DROP INDEX IF EXISTS public.idx_echeances_user_id;
DROP INDEX IF EXISTS public.idx_echeances_date;
DROP INDEX IF EXISTS public.idx_dossiers_user_id;
DROP INDEX IF EXISTS public.idx_dossiers_fulltext;
DROP INDEX IF EXISTS public.idx_dossiers_client_id;
DROP INDEX IF EXISTS public.idx_documents_user_id;
DROP INDEX IF EXISTS public.idx_documents_dossier_id;
DROP INDEX IF EXISTS public.idx_document_embeddings_vector;
DROP INDEX IF EXISTS public.idx_document_embeddings_user;
DROP INDEX IF EXISTS public.idx_document_embeddings_document_user;
DROP INDEX IF EXISTS public.idx_document_embeddings_document;
DROP INDEX IF EXISTS public.idx_crawler_health_metrics_source_id;
DROP INDEX IF EXISTS public.idx_crawler_health_metrics_period;
DROP INDEX IF EXISTS public.idx_crawl_logs_source;
DROP INDEX IF EXISTS public.idx_crawl_logs_job;
DROP INDEX IF EXISTS public.idx_crawl_jobs_status;
DROP INDEX IF EXISTS public.idx_crawl_jobs_source;
DROP INDEX IF EXISTS public.idx_crawl_jobs_pending;
DROP INDEX IF EXISTS public.idx_corrections_user;
DROP INDEX IF EXISTS public.idx_corrections_unused;
DROP INDEX IF EXISTS public.idx_corrections_rule;
DROP INDEX IF EXISTS public.idx_corrections_page;
DROP INDEX IF EXISTS public.idx_contradictions_type;
DROP INDEX IF EXISTS public.idx_contradictions_target;
DROP INDEX IF EXISTS public.idx_contradictions_status;
DROP INDEX IF EXISTS public.idx_contradictions_source;
DROP INDEX IF EXISTS public.idx_clients_user_id;
DROP INDEX IF EXISTS public.idx_clients_fulltext;
DROP INDEX IF EXISTS public.idx_chat_messages_created;
DROP INDEX IF EXISTS public.idx_chat_messages_conversation;
DROP INDEX IF EXISTS public.idx_chat_conversations_user;
DROP INDEX IF EXISTS public.idx_chat_conversations_updated;
DROP INDEX IF EXISTS public.idx_chat_conversations_summary_needed;
DROP INDEX IF EXISTS public.idx_chat_conversations_dossier;
DROP INDEX IF EXISTS public.idx_audit_logs_target_type;
DROP INDEX IF EXISTS public.idx_audit_logs_target_id;
DROP INDEX IF EXISTS public.idx_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_audit_logs_admin_id;
DROP INDEX IF EXISTS public.idx_audit_logs_admin_date;
DROP INDEX IF EXISTS public.idx_audit_logs_action_type;
DROP INDEX IF EXISTS public.idx_ai_usage_logs_user;
DROP INDEX IF EXISTS public.idx_ai_usage_logs_provider;
DROP INDEX IF EXISTS public.idx_ai_usage_logs_operation;
DROP INDEX IF EXISTS public.idx_ai_usage_logs_created;
DROP INDEX IF EXISTS public.idx_admin_notif_unread_priority;
DROP INDEX IF EXISTS public.idx_admin_notif_type;
DROP INDEX IF EXISTS public.idx_admin_notif_target;
DROP INDEX IF EXISTS public.idx_admin_notif_priority;
DROP INDEX IF EXISTS public.idx_admin_notif_is_read;
DROP INDEX IF EXISTS public.idx_admin_notif_created;
DROP INDEX IF EXISTS public.idx_actions_user_id;
DROP INDEX IF EXISTS public.idx_actions_dossier_id;
ALTER TABLE IF EXISTS ONLY public.web_sources DROP CONSTRAINT IF EXISTS web_sources_pkey;
ALTER TABLE IF EXISTS ONLY public.web_sources DROP CONSTRAINT IF EXISTS web_sources_base_url_key;
ALTER TABLE IF EXISTS ONLY public.web_source_ban_status DROP CONSTRAINT IF EXISTS web_source_ban_status_pkey;
ALTER TABLE IF EXISTS ONLY public.web_scheduler_config DROP CONSTRAINT IF EXISTS web_scheduler_config_pkey;
ALTER TABLE IF EXISTS ONLY public.web_pages DROP CONSTRAINT IF EXISTS web_pages_pkey;
ALTER TABLE IF EXISTS ONLY public.web_page_versions DROP CONSTRAINT IF EXISTS web_page_versions_web_page_id_version_key;
ALTER TABLE IF EXISTS ONLY public.web_page_versions DROP CONSTRAINT IF EXISTS web_page_versions_pkey;
ALTER TABLE IF EXISTS ONLY public.web_page_structured_metadata DROP CONSTRAINT IF EXISTS web_page_structured_metadata_web_page_id_key;
ALTER TABLE IF EXISTS ONLY public.web_page_structured_metadata DROP CONSTRAINT IF EXISTS web_page_structured_metadata_pkey;
ALTER TABLE IF EXISTS ONLY public.web_files DROP CONSTRAINT IF EXISTS web_files_pkey;
ALTER TABLE IF EXISTS ONLY public.web_crawl_logs DROP CONSTRAINT IF EXISTS web_crawl_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.web_crawl_jobs DROP CONSTRAINT IF EXISTS web_crawl_jobs_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE IF EXISTS ONLY public.user_activity_logs DROP CONSTRAINT IF EXISTS user_activity_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.web_pages DROP CONSTRAINT IF EXISTS unique_source_url;
ALTER TABLE IF EXISTS ONLY public.web_source_ban_status DROP CONSTRAINT IF EXISTS unique_source_ban_status;
ALTER TABLE IF EXISTS ONLY public.content_quality_assessments DROP CONSTRAINT IF EXISTS unique_quality_assessment;
ALTER TABLE IF EXISTS ONLY public.web_files DROP CONSTRAINT IF EXISTS unique_page_file_url;
ALTER TABLE IF EXISTS ONLY public.crawler_health_metrics DROP CONSTRAINT IF EXISTS unique_metrics_period;
ALTER TABLE IF EXISTS ONLY public.legal_classifications DROP CONSTRAINT IF EXISTS unique_legal_classification;
ALTER TABLE IF EXISTS ONLY public.time_entries DROP CONSTRAINT IF EXISTS time_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.templates DROP CONSTRAINT IF EXISTS templates_pkey;
ALTER TABLE IF EXISTS ONLY public.taxonomy_suggestions DROP CONSTRAINT IF EXISTS taxonomy_suggestions_pkey;
ALTER TABLE IF EXISTS ONLY public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.source_classification_rules DROP CONSTRAINT IF EXISTS source_classification_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_config DROP CONSTRAINT IF EXISTS platform_config_pkey;
ALTER TABLE IF EXISTS ONLY public.platform_config DROP CONSTRAINT IF EXISTS platform_config_key_key;
ALTER TABLE IF EXISTS ONLY public.pending_documents DROP CONSTRAINT IF EXISTS pending_documents_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_user_id_key;
ALTER TABLE IF EXISTS ONLY public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_logs DROP CONSTRAINT IF EXISTS notification_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.messaging_webhooks_config DROP CONSTRAINT IF EXISTS messaging_webhooks_config_user_id_platform_key;
ALTER TABLE IF EXISTS ONLY public.messaging_webhooks_config DROP CONSTRAINT IF EXISTS messaging_webhooks_config_pkey;
ALTER TABLE IF EXISTS ONLY public.legal_taxonomy DROP CONSTRAINT IF EXISTS legal_taxonomy_pkey;
ALTER TABLE IF EXISTS ONLY public.legal_taxonomy DROP CONSTRAINT IF EXISTS legal_taxonomy_code_unique;
ALTER TABLE IF EXISTS ONLY public.legal_classifications DROP CONSTRAINT IF EXISTS legal_classifications_pkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base_versions DROP CONSTRAINT IF EXISTS knowledge_base_versions_pkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base_versions DROP CONSTRAINT IF EXISTS knowledge_base_versions_knowledge_base_id_version_key;
ALTER TABLE IF EXISTS ONLY public.knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_pkey;
ALTER TABLE IF EXISTS ONLY public.knowledge_base_chunks DROP CONSTRAINT IF EXISTS knowledge_base_chunks_pkey;
ALTER TABLE IF EXISTS ONLY public.kb_document_relations DROP CONSTRAINT IF EXISTS kb_document_relations_source_document_id_target_document_id_key;
ALTER TABLE IF EXISTS ONLY public.kb_document_relations DROP CONSTRAINT IF EXISTS kb_document_relations_pkey;
ALTER TABLE IF EXISTS ONLY public.kb_bulk_imports DROP CONSTRAINT IF EXISTS kb_bulk_imports_pkey;
ALTER TABLE IF EXISTS ONLY public.jurisprudence_stats DROP CONSTRAINT IF EXISTS jurisprudence_stats_pkey;
ALTER TABLE IF EXISTS ONLY public.jurisprudence DROP CONSTRAINT IF EXISTS jurisprudence_pkey;
ALTER TABLE IF EXISTS ONLY public.indexing_jobs DROP CONSTRAINT IF EXISTS indexing_jobs_pkey;
ALTER TABLE IF EXISTS ONLY public.human_review_queue DROP CONSTRAINT IF EXISTS human_review_queue_pkey;
ALTER TABLE IF EXISTS ONLY public.flouci_transactions DROP CONSTRAINT IF EXISTS flouci_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.flouci_transactions DROP CONSTRAINT IF EXISTS flouci_transactions_payment_id_key;
ALTER TABLE IF EXISTS ONLY public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_user_id_key;
ALTER TABLE IF EXISTS ONLY public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_pkey;
ALTER TABLE IF EXISTS ONLY public.factures DROP CONSTRAINT IF EXISTS factures_pkey;
ALTER TABLE IF EXISTS ONLY public.factures DROP CONSTRAINT IF EXISTS factures_numero_key;
ALTER TABLE IF EXISTS ONLY public.echeances DROP CONSTRAINT IF EXISTS echeances_pkey;
ALTER TABLE IF EXISTS ONLY public.dossiers DROP CONSTRAINT IF EXISTS dossiers_pkey;
ALTER TABLE IF EXISTS ONLY public.dossiers DROP CONSTRAINT IF EXISTS dossiers_numero_key;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_pkey;
ALTER TABLE IF EXISTS ONLY public.document_embeddings DROP CONSTRAINT IF EXISTS document_embeddings_pkey;
ALTER TABLE IF EXISTS ONLY public.crawler_health_metrics DROP CONSTRAINT IF EXISTS crawler_health_metrics_pkey;
ALTER TABLE IF EXISTS ONLY public.content_quality_assessments DROP CONSTRAINT IF EXISTS content_quality_assessments_pkey;
ALTER TABLE IF EXISTS ONLY public.content_contradictions DROP CONSTRAINT IF EXISTS content_contradictions_pkey;
ALTER TABLE IF EXISTS ONLY public.cloud_providers_config DROP CONSTRAINT IF EXISTS cloud_providers_config_user_id_provider_key;
ALTER TABLE IF EXISTS ONLY public.cloud_providers_config DROP CONSTRAINT IF EXISTS cloud_providers_config_pkey;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_pkey;
ALTER TABLE IF EXISTS ONLY public.classification_learning_log DROP CONSTRAINT IF EXISTS classification_learning_log_pkey;
ALTER TABLE IF EXISTS ONLY public.classification_corrections DROP CONSTRAINT IF EXISTS classification_corrections_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_pkey;
ALTER TABLE IF EXISTS ONLY public.ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.actions DROP CONSTRAINT IF EXISTS actions_pkey;
ALTER TABLE IF EXISTS ONLY public._migrations DROP CONSTRAINT IF EXISTS _migrations_pkey;
ALTER TABLE IF EXISTS ONLY public._migrations DROP CONSTRAINT IF EXISTS _migrations_name_key;
ALTER TABLE IF EXISTS public._migrations ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.web_sources;
DROP TABLE IF EXISTS public.web_source_ban_status;
DROP TABLE IF EXISTS public.web_scheduler_config;
DROP TABLE IF EXISTS public.web_pages;
DROP TABLE IF EXISTS public.web_page_versions;
DROP TABLE IF EXISTS public.web_page_structured_metadata;
DROP TABLE IF EXISTS public.web_files;
DROP TABLE IF EXISTS public.web_crawl_logs;
DROP TABLE IF EXISTS public.web_crawl_jobs;
DROP TABLE IF EXISTS public.time_entries;
DROP TABLE IF EXISTS public.templates;
DROP TABLE IF EXISTS public.taxonomy_suggestions;
DROP TABLE IF EXISTS public.sync_logs;
DROP TABLE IF EXISTS public.source_classification_rules;
DROP VIEW IF EXISTS public.security_stats;
DROP TABLE IF EXISTS public.schema_migrations;
DROP TABLE IF EXISTS public.profiles;
DROP TABLE IF EXISTS public.platform_config;
DROP TABLE IF EXISTS public.pending_documents;
DROP TABLE IF EXISTS public.notification_preferences;
DROP TABLE IF EXISTS public.notification_logs;
DROP TABLE IF EXISTS public.messaging_webhooks_config;
DROP TABLE IF EXISTS public.legal_taxonomy;
DROP TABLE IF EXISTS public.legal_classifications;
DROP TABLE IF EXISTS public.knowledge_categories;
DROP TABLE IF EXISTS public.knowledge_base_versions;
DROP TABLE IF EXISTS public.knowledge_base_chunks;
DROP TABLE IF EXISTS public.knowledge_base;
DROP TABLE IF EXISTS public.kb_document_relations;
DROP TABLE IF EXISTS public.kb_bulk_imports;
DROP TABLE IF EXISTS public.jurisprudence_stats;
DROP TABLE IF EXISTS public.jurisprudence;
DROP VIEW IF EXISTS public.inpdp_data_access_report;
DROP TABLE IF EXISTS public.user_activity_logs;
DROP TABLE IF EXISTS public.indexing_jobs;
DROP TABLE IF EXISTS public.human_review_queue;
DROP TABLE IF EXISTS public.flouci_transactions;
DROP TABLE IF EXISTS public.feature_flags;
DROP TABLE IF EXISTS public.factures;
DROP TABLE IF EXISTS public.echeances;
DROP TABLE IF EXISTS public.dossiers;
DROP TABLE IF EXISTS public.documents;
DROP TABLE IF EXISTS public.document_embeddings;
DROP TABLE IF EXISTS public.crawler_health_metrics;
DROP TABLE IF EXISTS public.content_quality_assessments;
DROP TABLE IF EXISTS public.content_contradictions;
DROP TABLE IF EXISTS public.cloud_providers_config;
DROP TABLE IF EXISTS public.clients;
DROP TABLE IF EXISTS public.classification_learning_log;
DROP TABLE IF EXISTS public.classification_corrections;
DROP TABLE IF EXISTS public.chat_messages;
DROP TABLE IF EXISTS public.chat_conversations;
DROP VIEW IF EXISTS public.audit_logs_view;
DROP VIEW IF EXISTS public.ai_costs_daily;
DROP VIEW IF EXISTS public.ai_costs_by_user_month;
DROP TABLE IF EXISTS public.ai_usage_logs;
DROP TABLE IF EXISTS public.admin_audit_logs;
DROP VIEW IF EXISTS public.active_admin_notifications;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.admin_notifications;
DROP TABLE IF EXISTS public.actions;
DROP SEQUENCE IF EXISTS public._migrations_id_seq;
DROP TABLE IF EXISTS public._migrations;
DROP FUNCTION IF EXISTS public.validate_user_status_transition();
DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.update_templates_updated_at();
DROP FUNCTION IF EXISTS public.update_platform_config_timestamp();
DROP FUNCTION IF EXISTS public.update_pages_freshness();
DROP FUNCTION IF EXISTS public.update_jurisprudence_stats();
DROP FUNCTION IF EXISTS public.update_enfant_age();
DROP FUNCTION IF EXISTS public.update_crawler_success_rate();
DROP FUNCTION IF EXISTS public.unban_source(p_source_id uuid);
DROP FUNCTION IF EXISTS public.trigger_daily_notifications();
DROP FUNCTION IF EXISTS public.trigger_create_initial_version();
DROP FUNCTION IF EXISTS public.set_commission_flouci();
DROP FUNCTION IF EXISTS public.search_knowledge_base(query_embedding public.vector, p_category text, p_subcategory text, p_limit integer, p_threshold double precision);
DROP FUNCTION IF EXISTS public.search_jurisprudence_by_article(p_article text, p_limit integer);
DROP FUNCTION IF EXISTS public.search_jurisprudence(query_embedding public.vector, p_domain text, p_court text, p_limit integer, p_threshold double precision);
DROP FUNCTION IF EXISTS public.search_dossier_embeddings(query_embedding public.vector, p_dossier_id uuid, p_user_id uuid, p_limit integer, p_similarity_threshold double precision);
DROP FUNCTION IF EXISTS public.search_dossier_embeddings(query_embedding public.vector, p_dossier_id uuid, p_user_id uuid, p_limit integer);
DROP FUNCTION IF EXISTS public.search_document_embeddings(query_embedding public.vector, p_user_id uuid, p_limit integer, p_threshold double precision);
DROP FUNCTION IF EXISTS public.restore_knowledge_base_version(p_knowledge_base_id uuid, p_version_id uuid, p_restored_by uuid, p_reason text);
DROP FUNCTION IF EXISTS public.notify_plan_expiring();
DROP FUNCTION IF EXISTS public.notify_new_registration();
DROP FUNCTION IF EXISTS public.normalize_phone_tn(phone text);
DROP FUNCTION IF EXISTS public.nettoyer_transactions_flouci_expirees();
DROP FUNCTION IF EXISTS public.marquer_facture_payee_flouci();
DROP FUNCTION IF EXISTS public.mark_source_as_banned(p_source_id uuid, p_reason text, p_confidence text, p_retry_after_ms integer);
DROP FUNCTION IF EXISTS public.mark_notification_read(p_notification_id uuid, p_admin_id uuid);
DROP FUNCTION IF EXISTS public.mark_media_as_expired();
DROP FUNCTION IF EXISTS public.mark_all_notifications_read(p_admin_id uuid);
DROP FUNCTION IF EXISTS public.log_user_activity(p_user_id uuid, p_user_email character varying, p_action character varying, p_resource_type character varying, p_resource_id uuid, p_resource_label character varying, p_details jsonb, p_ip_address character varying, p_user_agent text, p_session_id character varying);
DROP FUNCTION IF EXISTS public.log_ai_usage(p_user_id uuid, p_operation_type text, p_provider text, p_model text, p_input_tokens integer, p_output_tokens integer, p_context jsonb);
DROP FUNCTION IF EXISTS public.increment_rule_match(p_rule_id uuid, p_is_correct boolean);
DROP FUNCTION IF EXISTS public.increment_ai_query_count(p_user_id uuid);
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.get_web_sources_stats();
DROP FUNCTION IF EXISTS public.get_web_source_files_stats(p_source_id uuid);
DROP FUNCTION IF EXISTS public.get_web_page_versions(p_web_page_id uuid, p_limit integer, p_offset integer);
DROP FUNCTION IF EXISTS public.get_user_monthly_costs(p_user_id uuid);
DROP FUNCTION IF EXISTS public.get_sources_to_crawl(p_limit integer);
DROP FUNCTION IF EXISTS public.get_review_queue_stats();
DROP FUNCTION IF EXISTS public.get_platform_config(config_key character varying);
DROP FUNCTION IF EXISTS public.get_knowledge_base_versions(p_knowledge_base_id uuid, p_limit integer, p_offset integer);
DROP FUNCTION IF EXISTS public.get_knowledge_base_stats();
DROP FUNCTION IF EXISTS public.get_intelligent_pipeline_stats();
DROP FUNCTION IF EXISTS public.get_indexing_queue_stats();
DROP FUNCTION IF EXISTS public.get_conversation_history(p_conversation_id uuid, p_limit integer);
DROP FUNCTION IF EXISTS public.find_similar_kb_documents(p_document_id uuid, p_threshold double precision, p_limit integer);
DROP FUNCTION IF EXISTS public.find_related_documents(p_document_id uuid, p_limit integer, p_threshold double precision);
DROP FUNCTION IF EXISTS public.expire_pending_documents();
DROP FUNCTION IF EXISTS public.ensure_super_admin();
DROP FUNCTION IF EXISTS public.create_web_page_version(p_web_page_id uuid, p_change_type character varying, p_diff_summary text);
DROP FUNCTION IF EXISTS public.create_review_request(p_review_type text, p_target_type text, p_target_id uuid, p_title text, p_description text, p_context jsonb, p_priority text, p_quality_score integer, p_confidence_score double precision, p_suggested_actions jsonb);
DROP FUNCTION IF EXISTS public.create_knowledge_base_version(p_knowledge_base_id uuid, p_changed_by uuid, p_change_reason text, p_change_type character varying);
DROP FUNCTION IF EXISTS public.create_default_notification_preferences();
DROP FUNCTION IF EXISTS public.create_crawl_job(p_source_id uuid, p_job_type text, p_priority integer, p_params jsonb);
DROP FUNCTION IF EXISTS public.create_chat_conversation(p_user_id uuid, p_dossier_id uuid, p_title text);
DROP FUNCTION IF EXISTS public.create_audit_log(p_admin_id uuid, p_admin_email character varying, p_action_type character varying, p_target_type character varying, p_target_id uuid, p_target_identifier character varying, p_old_value jsonb, p_new_value jsonb, p_ip_address character varying, p_user_agent text);
DROP FUNCTION IF EXISTS public.count_unread_notifications();
DROP FUNCTION IF EXISTS public.count_conversation_messages(p_conversation_id uuid);
DROP FUNCTION IF EXISTS public.complete_review(p_review_id uuid, p_user_id uuid, p_decision text, p_decision_notes text, p_modifications jsonb);
DROP FUNCTION IF EXISTS public.complete_indexing_job(p_job_id uuid, p_success boolean, p_error_message text);
DROP FUNCTION IF EXISTS public.complete_crawl_job(p_job_id uuid, p_success boolean, p_pages_processed integer, p_pages_new integer, p_pages_changed integer, p_pages_failed integer, p_files_downloaded integer, p_error_message text, p_errors jsonb);
DROP FUNCTION IF EXISTS public.cleanup_old_whatsapp_messages(retention_days integer);
DROP FUNCTION IF EXISTS public.cleanup_old_sync_logs();
DROP FUNCTION IF EXISTS public.cleanup_old_indexing_jobs();
DROP FUNCTION IF EXISTS public.cleanup_old_activity_logs(retention_years integer);
DROP FUNCTION IF EXISTS public.clean_old_notification_logs();
DROP FUNCTION IF EXISTS public.claim_next_review_item(p_user_id uuid, p_review_types text[], p_priority_min text);
DROP FUNCTION IF EXISTS public.claim_next_indexing_job();
DROP FUNCTION IF EXISTS public.claim_next_crawl_job(p_worker_id text);
DROP FUNCTION IF EXISTS public.calculer_commission_flouci(montant numeric);
DROP FUNCTION IF EXISTS public.calculate_facture_montants();
DROP FUNCTION IF EXISTS public.auto_normalize_client_phone();
DROP FUNCTION IF EXISTS public.add_indexing_job(p_job_type text, p_target_id uuid, p_priority integer, p_metadata jsonb);
DROP FUNCTION IF EXISTS public.add_chat_message(p_conversation_id uuid, p_role text, p_content text, p_sources jsonb, p_tokens_used integer, p_model text);
DROP FUNCTION IF EXISTS public.actualiser_tous_interets_commerciaux();
DROP FUNCTION IF EXISTS public.actualiser_pension_compensatoire(dossier_id uuid);
DROP FUNCTION IF EXISTS public.actualiser_pension_alimentaire(dossier_id uuid, pourcentage_revenus numeric);
DROP FUNCTION IF EXISTS public.actualiser_interets_commerciaux(dossier_id uuid);
DROP TYPE IF EXISTS public.client_type;
DROP EXTENSION IF EXISTS vector;
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS pg_trgm;
--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: client_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.client_type AS ENUM (
    'PERSONNE_PHYSIQUE',
    'PERSONNE_MORALE'
);


--
-- Name: actualiser_interets_commerciaux(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualiser_interets_commerciaux(dossier_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_montant_principal DECIMAL(12,3);
  v_date_mise_en_demeure DATE;
  v_taux_interet DECIMAL(5,2);
  v_jours_retard INTEGER;
  v_interets DECIMAL(12,3);
BEGIN
  -- Récupérer les données du dossier
  SELECT montant_principal, date_mise_en_demeure, COALESCE(taux_interet, 14.5)
  INTO v_montant_principal, v_date_mise_en_demeure, v_taux_interet
  FROM dossiers
  WHERE id = dossier_id;

  -- Vérifier données valides
  IF v_montant_principal IS NULL OR v_date_mise_en_demeure IS NULL THEN
    RETURN;
  END IF;

  -- Calculer jours de retard
  v_jours_retard := (CURRENT_DATE - v_date_mise_en_demeure)::INTEGER;

  -- Calculer intérêts
  v_interets := (v_montant_principal * (v_taux_interet / 100) * (v_jours_retard::DECIMAL / 365))::DECIMAL(12,3);

  -- Mettre à jour
  UPDATE dossiers
  SET interets_calcules = v_interets
  WHERE id = dossier_id;
END;
$$;


--
-- Name: actualiser_pension_alimentaire(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualiser_pension_alimentaire(dossier_id uuid, pourcentage_revenus numeric DEFAULT 25) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_revenus_pere DECIMAL(10,3);
  v_nb_enfants_mineurs INTEGER;
  v_total_central DECIMAL(10,3);
  v_par_enfant DECIMAL(10,3);
BEGIN
  -- Récupérer revenus père et compter enfants mineurs
  SELECT revenus_pere
  INTO v_revenus_pere
  FROM dossiers
  WHERE id = dossier_id;

  SELECT COUNT(*)
  INTO v_nb_enfants_mineurs
  FROM dossier_enfants
  WHERE dossier_id = actualiser_pension_alimentaire.dossier_id
    AND est_mineur = true;

  -- Vérifier données valides
  IF v_revenus_pere IS NULL OR v_revenus_pere <= 0 OR v_nb_enfants_mineurs = 0 THEN
    RETURN;
  END IF;

  -- Calcul: 25% revenus père ÷ nb enfants
  v_total_central := (v_revenus_pere * pourcentage_revenus / 100)::DECIMAL(10,3);
  v_par_enfant := (v_total_central / v_nb_enfants_mineurs)::DECIMAL(10,3);

  -- Mettre à jour dossier
  UPDATE dossiers
  SET
    pension_alimentaire_par_enfant = v_par_enfant,
    pension_alimentaire_total = v_total_central
  WHERE id = dossier_id;

  -- Mettre à jour chaque enfant mineur
  UPDATE dossier_enfants
  SET pension_alimentaire_montant = v_par_enfant
  WHERE dossier_id = actualiser_pension_alimentaire.dossier_id
    AND est_mineur = true;
END;
$$;


--
-- Name: actualiser_pension_compensatoire(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualiser_pension_compensatoire(dossier_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_date_mariage DATE;
  v_revenus_epoux DECIMAL(10,3);
  v_coefficient DECIMAL(4,2);
  v_duree_annees DECIMAL(5,1);
  v_moutaa DECIMAL(10,3);
BEGIN
  -- Récupérer les données du dossier
  SELECT date_mariage, revenus_epoux, COALESCE(coefficient_moutaa, 2.0)
  INTO v_date_mariage, v_revenus_epoux, v_coefficient
  FROM dossiers
  WHERE id = dossier_id;

  -- Vérifier données valides
  IF v_date_mariage IS NULL OR v_revenus_epoux IS NULL OR v_revenus_epoux <= 0 THEN
    RETURN;
  END IF;

  -- Calculer durée mariage
  v_duree_annees := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_date_mariage))::NUMERIC +
                    (EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_date_mariage))::NUMERIC / 12);

  -- Calculer Moutaa: Durée (années) × Coefficient (2) × Revenus mensuels
  v_moutaa := (v_duree_annees * v_coefficient * v_revenus_epoux)::DECIMAL(10,3);

  -- Mettre à jour
  UPDATE dossiers
  SET
    duree_mariage_annees = v_duree_annees,
    pension_compensatoire_moutaa = v_moutaa
  WHERE id = dossier_id;
END;
$$;


--
-- Name: actualiser_tous_interets_commerciaux(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualiser_tous_interets_commerciaux() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER := 0;
  v_dossier RECORD;
BEGIN
  FOR v_dossier IN
    SELECT id
    FROM dossiers
    WHERE type_litige_commercial IS NOT NULL
      AND montant_principal IS NOT NULL
      AND date_mise_en_demeure IS NOT NULL
      AND statut NOT IN ('TERMINE', 'ABANDONNE')
  LOOP
    PERFORM actualiser_interets_commerciaux(v_dossier.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: add_chat_message(uuid, text, text, jsonb, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_chat_message(p_conversation_id uuid, p_role text, p_content text, p_sources jsonb DEFAULT NULL::jsonb, p_tokens_used integer DEFAULT NULL::integer, p_model text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_message_id UUID;
BEGIN
  INSERT INTO chat_messages (conversation_id, role, content, sources, tokens_used, model)
  VALUES (p_conversation_id, p_role, p_content, p_sources, p_tokens_used, p_model)
  RETURNING id INTO v_message_id;

  -- Mettre à jour la conversation
  UPDATE chat_conversations
  SET updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN v_message_id;
END;
$$;


--
-- Name: add_indexing_job(text, uuid, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_indexing_job(p_job_type text, p_target_id uuid, p_priority integer DEFAULT 5, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_job_id UUID;
  v_existing_id UUID;
BEGIN
  -- Vérifier s'il existe déjà un job pending/processing pour cette cible
  SELECT id INTO v_existing_id
  FROM indexing_jobs
  WHERE target_id = p_target_id
    AND job_type = p_job_type
    AND status IN ('pending', 'processing')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Retourner l'ID existant
    RETURN v_existing_id;
  END IF;

  -- Créer un nouveau job
  INSERT INTO indexing_jobs (job_type, target_id, priority, metadata)
  VALUES (p_job_type, p_target_id, p_priority, p_metadata)
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;


--
-- Name: auto_normalize_client_phone(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_normalize_client_phone() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Normaliser téléphone principal
  IF NEW.telephone IS NOT NULL THEN
    NEW.telephone_normalized := normalize_phone_tn(NEW.telephone);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: calculate_facture_montants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_facture_montants() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.montant_tva := ROUND(NEW.montant_ht * NEW.taux_tva / 100, 2);
  NEW.montant_ttc := NEW.montant_ht + NEW.montant_tva;
  RETURN NEW;
END;
$$;


--
-- Name: calculer_commission_flouci(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculer_commission_flouci(montant numeric) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- Commission Flouci: 1.5% du montant
  RETURN ROUND((montant * 0.015)::NUMERIC, 3);
END;
$$;


--
-- Name: claim_next_crawl_job(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_crawl_job(p_worker_id text DEFAULT NULL::text) RETURNS TABLE(job_id uuid, web_source_id uuid, job_type text, params jsonb, source_name text, base_url text, category text, requires_javascript boolean, css_selectors jsonb, max_depth integer, max_pages integer, rate_limit_ms integer, timeout_ms integer, respect_robots_txt boolean, user_agent text, custom_headers jsonb, seed_urls text[], form_crawl_config jsonb, ignore_ssl_errors boolean, url_patterns text[], excluded_patterns text[], follow_links boolean, download_files boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Sélectionner et verrouiller le prochain job
  SELECT j.id INTO v_job_id
  FROM web_crawl_jobs j
  WHERE j.status = 'pending'
  ORDER BY j.priority DESC, j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Marquer comme running
  UPDATE web_crawl_jobs
  SET status = 'running',
      started_at = NOW(),
      worker_id = p_worker_id
  WHERE id = v_job_id;

  -- Retourner les infos du job avec la config de la source
  RETURN QUERY
  SELECT
    j.id as job_id,
    j.web_source_id,
    j.job_type,
    j.params,
    s.name as source_name,
    s.base_url,
    s.category,
    s.requires_javascript,
    s.css_selectors,
    s.max_depth,
    s.max_pages,
    s.rate_limit_ms,
    s.timeout_ms,
    s.respect_robots_txt,
    s.user_agent,
    s.custom_headers,
    s.seed_urls,
    s.form_crawl_config,
    s.ignore_ssl_errors,
    s.url_patterns,
    s.excluded_patterns,
    s.follow_links,
    s.download_files
  FROM web_crawl_jobs j
  JOIN web_sources s ON j.web_source_id = s.id
  WHERE j.id = v_job_id;
END;
$$;


--
-- Name: claim_next_indexing_job(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_indexing_job() RETURNS TABLE(id uuid, job_type text, target_id uuid, priority integer, attempts integer, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Sélectionner et verrouiller le prochain job
  SELECT ij.id INTO v_job_id
  FROM indexing_jobs ij
  WHERE ij.status = 'pending'
    AND ij.attempts < ij.max_attempts
  ORDER BY ij.priority DESC, ij.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Marquer comme en cours de traitement
  UPDATE indexing_jobs
  SET status = 'processing',
      started_at = NOW(),
      attempts = indexing_jobs.attempts + 1
  WHERE indexing_jobs.id = v_job_id;

  -- Retourner les détails du job
  RETURN QUERY
  SELECT ij.id, ij.job_type, ij.target_id, ij.priority, ij.attempts, ij.metadata
  FROM indexing_jobs ij
  WHERE ij.id = v_job_id;
END;
$$;


--
-- Name: claim_next_review_item(uuid, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_next_review_item(p_user_id uuid, p_review_types text[] DEFAULT NULL::text[], p_priority_min text DEFAULT 'low'::text) RETURNS TABLE(review_id uuid, review_type text, target_type text, target_id uuid, title text, description text, context jsonb, suggested_actions jsonb, priority text, quality_score integer, confidence_score double precision)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_review_id UUID;
  v_priority_order TEXT[] := ARRAY['urgent', 'high', 'normal', 'low'];
  v_min_priority_idx INTEGER;
BEGIN
  -- Trouver l'index de la priorité minimum
  SELECT array_position(v_priority_order, p_priority_min) INTO v_min_priority_idx;
  IF v_min_priority_idx IS NULL THEN
    v_min_priority_idx := 4; -- 'low'
  END IF;

  -- Sélectionner et verrouiller le prochain item
  SELECT h.id INTO v_review_id
  FROM human_review_queue h
  WHERE h.status = 'pending'
    AND (p_review_types IS NULL OR h.review_type = ANY(p_review_types))
    AND array_position(v_priority_order, h.priority) <= v_min_priority_idx
    AND (h.expires_at IS NULL OR h.expires_at > NOW())
  ORDER BY
    array_position(v_priority_order, h.priority),
    h.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_review_id IS NULL THEN
    RETURN;
  END IF;

  -- Marquer comme assigné
  UPDATE human_review_queue
  SET status = 'assigned',
      assigned_to = p_user_id,
      assigned_at = NOW()
  WHERE id = v_review_id;

  -- Retourner les détails
  RETURN QUERY
  SELECT
    h.id as review_id,
    h.review_type,
    h.target_type,
    h.target_id,
    h.title,
    h.description,
    h.context,
    h.suggested_actions,
    h.priority,
    h.quality_score,
    h.confidence_score
  FROM human_review_queue h
  WHERE h.id = v_review_id;
END;
$$;


--
-- Name: clean_old_notification_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clean_old_notification_logs() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM notification_logs
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;


--
-- Name: cleanup_old_activity_logs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_activity_logs(retention_years integer DEFAULT 2) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_activity_logs
  WHERE created_at < NOW() - (retention_years || ' years')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_old_indexing_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_indexing_jobs() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM indexing_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


--
-- Name: cleanup_old_sync_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_sync_logs() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Supprimer logs synchronisation > 90 jours
  DELETE FROM public.sync_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;


--
-- Name: cleanup_old_whatsapp_messages(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_whatsapp_messages(retention_days integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Supprimer messages anciens
  DELETE FROM whatsapp_messages
  WHERE received_at < (now() - (retention_days || ' days')::INTERVAL)
  RETURNING id INTO deleted_count;

  -- Supprimer cache médias orphelins
  DELETE FROM whatsapp_media_cache
  WHERE whatsapp_message_id NOT IN (SELECT whatsapp_message_id FROM whatsapp_messages);

  RETURN COALESCE(deleted_count, 0);
END;
$$;


--
-- Name: complete_crawl_job(uuid, boolean, integer, integer, integer, integer, integer, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_crawl_job(p_job_id uuid, p_success boolean, p_pages_processed integer DEFAULT 0, p_pages_new integer DEFAULT 0, p_pages_changed integer DEFAULT 0, p_pages_failed integer DEFAULT 0, p_files_downloaded integer DEFAULT 0, p_error_message text DEFAULT NULL::text, p_errors jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_source_id UUID;
  v_started_at TIMESTAMPTZ;
  v_duration_ms INTEGER;
BEGIN
  -- Récupérer les infos du job
  SELECT web_source_id, started_at
  INTO v_source_id, v_started_at
  FROM web_crawl_jobs
  WHERE id = p_job_id;

  -- Calculer la durée
  v_duration_ms := EXTRACT(EPOCH FROM (NOW() - v_started_at)) * 1000;

  -- Mettre à jour le job
  UPDATE web_crawl_jobs
  SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      completed_at = NOW(),
      pages_processed = p_pages_processed,
      pages_new = p_pages_new,
      pages_changed = p_pages_changed,
      pages_failed = p_pages_failed,
      files_downloaded = p_files_downloaded,
      error_message = p_error_message,
      errors = p_errors
  WHERE id = p_job_id;

  -- Mettre à jour la source
  UPDATE web_sources
  SET last_crawl_at = NOW(),
      last_successful_crawl_at = CASE WHEN p_success THEN NOW() ELSE last_successful_crawl_at END,
      next_crawl_at = NOW() + crawl_frequency,
      consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures + 1 END,
      health_status = CASE
        WHEN p_success THEN 'healthy'
        WHEN consecutive_failures >= 3 THEN 'failing'
        ELSE 'degraded'
      END,
      total_pages_discovered = total_pages_discovered + p_pages_new,
      total_pages_indexed = total_pages_indexed + p_pages_changed + p_pages_new - p_pages_failed,
      avg_crawl_duration_ms = CASE
        WHEN avg_crawl_duration_ms = 0 THEN v_duration_ms
        ELSE (avg_crawl_duration_ms + v_duration_ms) / 2
      END,
      avg_pages_per_crawl = CASE
        WHEN avg_pages_per_crawl = 0 THEN p_pages_processed
        ELSE (avg_pages_per_crawl + p_pages_processed) / 2
      END
  WHERE id = v_source_id;

  -- Créer une entrée de log
  INSERT INTO web_crawl_logs (
    web_source_id, job_id, started_at, completed_at, duration_ms,
    pages_crawled, pages_new, pages_changed, pages_failed,
    files_downloaded, status, error_message, errors
  ) VALUES (
    v_source_id, p_job_id, v_started_at, NOW(), v_duration_ms,
    p_pages_processed, p_pages_new, p_pages_changed, p_pages_failed,
    p_files_downloaded,
    CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    p_error_message, p_errors
  );
END;
$$;


--
-- Name: complete_indexing_job(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_indexing_job(p_job_id uuid, p_success boolean, p_error_message text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE indexing_jobs
  SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      completed_at = NOW(),
      error_message = p_error_message
  WHERE id = p_job_id;

  RETURN FOUND;
END;
$$;


--
-- Name: complete_review(uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_review(p_review_id uuid, p_user_id uuid, p_decision text, p_decision_notes text DEFAULT NULL::text, p_modifications jsonb DEFAULT '{}'::jsonb) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_started_at TIMESTAMPTZ;
  v_time_ms INTEGER;
BEGIN
  -- Vérifier que l'item est assigné à cet utilisateur
  SELECT assigned_at INTO v_started_at
  FROM human_review_queue
  WHERE id = p_review_id
    AND (assigned_to = p_user_id OR assigned_to IS NULL);

  IF v_started_at IS NULL THEN
    RETURN false;
  END IF;

  -- Calculer le temps de décision
  v_time_ms := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_started_at, NOW()))) * 1000;

  -- Mettre à jour
  UPDATE human_review_queue
  SET status = 'completed',
      decision = p_decision,
      decision_notes = p_decision_notes,
      modifications_made = p_modifications,
      completed_by = p_user_id,
      completed_at = NOW(),
      time_to_decision_ms = v_time_ms
  WHERE id = p_review_id;

  RETURN true;
END;
$$;


--
-- Name: count_conversation_messages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_conversation_messages(p_conversation_id uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM chat_messages
  WHERE conversation_id = p_conversation_id;

  RETURN v_count;
END;
$$;


--
-- Name: count_unread_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_unread_notifications() RETURNS TABLE(total integer, urgent integer, high integer, normal integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total,
    COUNT(*) FILTER (WHERE priority = 'urgent')::INTEGER as urgent,
    COUNT(*) FILTER (WHERE priority = 'high')::INTEGER as high,
    COUNT(*) FILTER (WHERE priority = 'normal')::INTEGER as normal
  FROM admin_notifications
  WHERE is_read = FALSE
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$;


--
-- Name: create_audit_log(uuid, character varying, character varying, character varying, uuid, character varying, jsonb, jsonb, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_audit_log(p_admin_id uuid, p_admin_email character varying, p_action_type character varying, p_target_type character varying, p_target_id uuid DEFAULT NULL::uuid, p_target_identifier character varying DEFAULT NULL::character varying, p_old_value jsonb DEFAULT NULL::jsonb, p_new_value jsonb DEFAULT NULL::jsonb, p_ip_address character varying DEFAULT NULL::character varying, p_user_agent text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO admin_audit_logs (
    admin_id, admin_email, action_type, target_type,
    target_id, target_identifier, old_value, new_value,
    ip_address, user_agent
  ) VALUES (
    p_admin_id, p_admin_email, p_action_type, p_target_type,
    p_target_id, p_target_identifier, p_old_value, p_new_value,
    p_ip_address, p_user_agent
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;


--
-- Name: create_chat_conversation(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_chat_conversation(p_user_id uuid, p_dossier_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  INSERT INTO chat_conversations (user_id, dossier_id, title)
  VALUES (p_user_id, p_dossier_id, p_title)
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$;


--
-- Name: create_crawl_job(uuid, text, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_crawl_job(p_source_id uuid, p_job_type text DEFAULT 'incremental'::text, p_priority integer DEFAULT 5, p_params jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Vérifier qu'il n'y a pas déjà un job en cours pour cette source
  IF EXISTS (
    SELECT 1 FROM web_crawl_jobs
    WHERE web_source_id = p_source_id
    AND status IN ('pending', 'running')
  ) THEN
    RAISE EXCEPTION 'Un job est déjà en cours pour cette source';
  END IF;

  INSERT INTO web_crawl_jobs (web_source_id, job_type, priority, params)
  VALUES (p_source_id, p_job_type, p_priority, p_params)
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;


--
-- Name: create_default_notification_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_notification_preferences() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: create_knowledge_base_version(uuid, uuid, text, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_knowledge_base_version(p_knowledge_base_id uuid, p_changed_by uuid, p_change_reason text DEFAULT NULL::text, p_change_type character varying DEFAULT 'update'::character varying) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_version_id UUID;
  v_new_version INTEGER;
BEGIN
  -- Calculer le nouveau numéro de version
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM knowledge_base_versions
  WHERE knowledge_base_id = p_knowledge_base_id;

  -- Insérer la nouvelle version avec snapshot des données actuelles
  INSERT INTO knowledge_base_versions (
    knowledge_base_id,
    version,
    title,
    description,
    full_text,
    source_file,
    metadata,
    category,
    subcategory,
    tags,
    language,
    changed_by,
    change_reason,
    change_type
  )
  SELECT
    id,
    v_new_version,
    title,
    description,
    full_text,
    source_file,
    metadata,
    category,
    subcategory,
    tags,
    language,
    p_changed_by,
    p_change_reason,
    p_change_type
  FROM knowledge_base
  WHERE id = p_knowledge_base_id
  RETURNING id INTO v_version_id;

  -- Mettre à jour le numéro de version sur le document principal
  UPDATE knowledge_base
  SET version = v_new_version
  WHERE id = p_knowledge_base_id;

  RETURN v_version_id;
END;
$$;


--
-- Name: create_review_request(text, text, uuid, text, text, jsonb, text, integer, double precision, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_review_request(p_review_type text, p_target_type text, p_target_id uuid, p_title text, p_description text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb, p_priority text DEFAULT 'normal'::text, p_quality_score integer DEFAULT NULL::integer, p_confidence_score double precision DEFAULT NULL::double precision, p_suggested_actions jsonb DEFAULT '[]'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_review_id UUID;
BEGIN
  -- Vérifier qu'une demande similaire n'existe pas déjà
  IF EXISTS (
    SELECT 1 FROM human_review_queue
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND status IN ('pending', 'assigned', 'in_progress')
  ) THEN
    -- Retourner l'ID existant
    SELECT id INTO v_review_id
    FROM human_review_queue
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND status IN ('pending', 'assigned', 'in_progress')
    LIMIT 1;
    RETURN v_review_id;
  END IF;

  INSERT INTO human_review_queue (
    review_type, target_type, target_id, title, description,
    context, priority, quality_score, confidence_score, suggested_actions
  ) VALUES (
    p_review_type, p_target_type, p_target_id, p_title, p_description,
    p_context, p_priority, p_quality_score, p_confidence_score, p_suggested_actions
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$$;


--
-- Name: create_web_page_version(uuid, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_web_page_version(p_web_page_id uuid, p_change_type character varying DEFAULT 'content_change'::character varying, p_diff_summary text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$DECLARE v_version_id UUID; v_new_version INTEGER; BEGIN SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version FROM web_page_versions WHERE web_page_id = p_web_page_id; INSERT INTO web_page_versions (web_page_id, version, title, extracted_text, content_hash, word_count, metadata, change_type, diff_summary) SELECT id, v_new_version, title, extracted_text, content_hash, word_count, structured_data, p_change_type, p_diff_summary FROM web_pages WHERE id = p_web_page_id RETURNING id INTO v_version_id; RETURN v_version_id; END;$$;


--
-- Name: ensure_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_super_admin() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Empêcher la modification du rôle de l'admin principal
  IF OLD.email = 'salmen.ktata@gmail.com' AND NEW.role != 'super_admin' THEN
    NEW.role := 'super_admin';
    RAISE NOTICE 'Protection: salmen.ktata@gmail.com reste super_admin';
  END IF;

  -- Empêcher la suspension de l'admin principal
  IF OLD.email = 'salmen.ktata@gmail.com' AND NEW.status != 'approved' THEN
    NEW.status := 'approved';
    NEW.is_approved := TRUE;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: expire_pending_documents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_pending_documents() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Marquer documents pending > 30 jours comme expirés
  UPDATE public.pending_documents
  SET
    status = 'expired',
    resolved_at = NOW(),
    updated_at = NOW()
  WHERE
    status = 'pending'
    AND created_at < NOW() - INTERVAL '30 days';
END;
$$;


--
-- Name: find_related_documents(uuid, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_related_documents(p_document_id uuid, p_limit integer DEFAULT 5, p_threshold double precision DEFAULT 0.6) RETURNS TABLE(id uuid, title text, description text, category text, subcategory character varying, language character varying, similarity double precision, chunk_count integer, tags text[], created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_embedding vector(1024);
  v_category TEXT;
BEGIN
  -- Récupérer l'embedding du document source
  SELECT kb.embedding, kb.category INTO v_embedding, v_category
  FROM knowledge_base kb
  WHERE kb.id = p_document_id
    AND kb.is_active = true
    AND kb.is_indexed = true;

  -- Si le document n'a pas d'embedding, retourner vide
  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Rechercher les documents similaires via KNN sur l'index HNSW
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.description,
    kb.category,
    kb.subcategory,
    kb.language,
    (1 - (kb.embedding <=> v_embedding))::FLOAT as similarity,
    COALESCE(
      (SELECT COUNT(*)::INTEGER FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = kb.id),
      0
    ) as chunk_count,
    kb.tags,
    kb.created_at
  FROM knowledge_base kb
  WHERE kb.id != p_document_id
    AND kb.is_active = true
    AND kb.is_indexed = true
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> v_embedding)) >= p_threshold
  ORDER BY kb.embedding <=> v_embedding
  LIMIT p_limit;
END;
$$;


--
-- Name: find_similar_kb_documents(uuid, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_similar_kb_documents(p_document_id uuid, p_threshold double precision DEFAULT 0.7, p_limit integer DEFAULT 10) RETURNS TABLE(id uuid, title text, category text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title::TEXT,
    kb.category::TEXT,
    1 - (kb.embedding <=> (SELECT embedding FROM knowledge_base WHERE knowledge_base.id = p_document_id))::FLOAT AS similarity
  FROM knowledge_base kb
  WHERE kb.id != p_document_id
    AND kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND (SELECT embedding FROM knowledge_base WHERE knowledge_base.id = p_document_id) IS NOT NULL
    AND 1 - (kb.embedding <=> (SELECT embedding FROM knowledge_base WHERE knowledge_base.id = p_document_id)) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_conversation_history(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversation_history(p_conversation_id uuid, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, role text, content text, sources jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.role, m.content, m.sources, m.created_at
  FROM chat_messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_indexing_queue_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_indexing_queue_stats() RETURNS TABLE(pending_count bigint, processing_count bigint, completed_today bigint, failed_today bigint, avg_processing_time_ms numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'pending') as pending_count,
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'processing') as processing_count,
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'completed' AND completed_at >= CURRENT_DATE) as completed_today,
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'failed' AND completed_at >= CURRENT_DATE) as failed_today,
    (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000), 2)
     FROM indexing_jobs
     WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
     AND completed_at >= CURRENT_DATE) as avg_processing_time_ms;
END;
$$;


--
-- Name: get_intelligent_pipeline_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_intelligent_pipeline_stats() RETURNS TABLE(total_processed bigint, auto_indexed bigint, auto_rejected bigint, pending_review bigint, avg_quality_score double precision, by_domain jsonb, by_category jsonb, contradictions_count bigint, contradictions_critical bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM web_pages WHERE processing_status != 'pending')::BIGINT,
    (SELECT COUNT(*) FROM web_pages WHERE processing_status = 'validated' AND is_indexed = true)::BIGINT,
    (SELECT COUNT(*) FROM web_pages WHERE processing_status = 'rejected')::BIGINT,
    (SELECT COUNT(*) FROM web_pages WHERE requires_human_review = true AND processing_status NOT IN ('validated', 'rejected'))::BIGINT,
    (SELECT COALESCE(AVG(overall_score), 0)::FLOAT FROM content_quality_assessments),
    (
      SELECT COALESCE(jsonb_object_agg(domain, cnt), '{}'::jsonb)
      FROM (
        SELECT domain, COUNT(*) as cnt
        FROM legal_classifications
        WHERE domain IS NOT NULL
        GROUP BY domain
      ) sub
    ),
    (
      SELECT COALESCE(jsonb_object_agg(primary_category, cnt), '{}'::jsonb)
      FROM (
        SELECT primary_category, COUNT(*) as cnt
        FROM legal_classifications
        GROUP BY primary_category
      ) sub
    ),
    (SELECT COUNT(*) FROM content_contradictions WHERE status IN ('pending', 'under_review'))::BIGINT,
    (SELECT COUNT(*) FROM content_contradictions WHERE severity = 'critical' AND status = 'pending')::BIGINT;
END;
$$;


--
-- Name: get_knowledge_base_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_knowledge_base_stats() RETURNS TABLE(total_documents bigint, indexed_documents bigint, total_chunks bigint, by_category jsonb, by_subcategory jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM knowledge_base WHERE is_active = true) as total_documents,
    (SELECT COUNT(*) FROM knowledge_base WHERE is_indexed = true AND is_active = true) as indexed_documents,
    (SELECT COUNT(*) FROM knowledge_base_chunks kbc
     JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
     WHERE kb.is_active = true) as total_chunks,
    (
      SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM knowledge_base
        WHERE is_active = true
        GROUP BY category
      ) sub
    ) as by_category,
    (
      SELECT COALESCE(jsonb_object_agg(COALESCE(subcategory, 'none'), cnt), '{}'::jsonb)
      FROM (
        SELECT subcategory, COUNT(*) as cnt
        FROM knowledge_base
        WHERE is_active = true AND subcategory IS NOT NULL
        GROUP BY subcategory
      ) sub
    ) as by_subcategory;
END;
$$;


--
-- Name: get_knowledge_base_versions(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_knowledge_base_versions(p_knowledge_base_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, version integer, title character varying, change_type character varying, change_reason text, changed_by uuid, changed_by_email text, changed_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbv.id,
    kbv.version,
    kbv.title,
    kbv.change_type,
    kbv.change_reason,
    kbv.changed_by,
    u.email::TEXT as changed_by_email,
    kbv.changed_at
  FROM knowledge_base_versions kbv
  LEFT JOIN users u ON kbv.changed_by = u.id
  WHERE kbv.knowledge_base_id = p_knowledge_base_id
  ORDER BY kbv.version DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


--
-- Name: get_platform_config(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_platform_config(config_key character varying) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  config_value TEXT;
BEGIN
  SELECT value INTO config_value
  FROM platform_config
  WHERE key = config_key AND is_active = true;

  RETURN config_value;
END;
$$;


--
-- Name: get_review_queue_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_review_queue_stats() RETURNS TABLE(pending_count bigint, assigned_count bigint, completed_today bigint, avg_decision_time_ms bigint, by_type jsonb, by_priority jsonb, by_decision jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM human_review_queue WHERE status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM human_review_queue WHERE status IN ('assigned', 'in_progress'))::BIGINT,
    (SELECT COUNT(*) FROM human_review_queue WHERE status = 'completed' AND completed_at >= CURRENT_DATE)::BIGINT,
    (SELECT COALESCE(AVG(time_to_decision_ms), 0)::BIGINT FROM human_review_queue WHERE status = 'completed'),
    (
      SELECT COALESCE(jsonb_object_agg(review_type, cnt), '{}'::jsonb)
      FROM (
        SELECT review_type, COUNT(*) as cnt
        FROM human_review_queue
        WHERE status = 'pending'
        GROUP BY review_type
      ) sub
    ),
    (
      SELECT COALESCE(jsonb_object_agg(priority, cnt), '{}'::jsonb)
      FROM (
        SELECT priority, COUNT(*) as cnt
        FROM human_review_queue
        WHERE status = 'pending'
        GROUP BY priority
      ) sub
    ),
    (
      SELECT COALESCE(jsonb_object_agg(decision, cnt), '{}'::jsonb)
      FROM (
        SELECT decision, COUNT(*) as cnt
        FROM human_review_queue
        WHERE status = 'completed' AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY decision
      ) sub
    );
END;
$$;


--
-- Name: get_sources_to_crawl(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sources_to_crawl(p_limit integer DEFAULT 10) RETURNS TABLE(id uuid, name text, base_url text, category text, priority integer, last_crawl_at timestamp with time zone, next_crawl_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.name, s.base_url, s.category, s.priority,
    s.last_crawl_at, s.next_crawl_at
  FROM web_sources s
  WHERE s.is_active = true
    AND s.health_status != 'failing'
    AND (s.next_crawl_at IS NULL OR s.next_crawl_at <= NOW())
    AND NOT EXISTS (
      SELECT 1 FROM web_crawl_jobs j
      WHERE j.web_source_id = s.id
      AND j.status IN ('pending', 'running')
    )
  ORDER BY s.priority DESC, s.next_crawl_at ASC NULLS FIRST
  LIMIT p_limit;
END;
$$;


--
-- Name: get_user_monthly_costs(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_monthly_costs(p_user_id uuid) RETURNS TABLE(total_operations bigint, total_cost_usd numeric, embeddings_count bigint, chat_count bigint, generation_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_operations,
    COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd,
    COUNT(*) FILTER (WHERE operation_type = 'embedding') as embeddings_count,
    COUNT(*) FILTER (WHERE operation_type = 'chat') as chat_count,
    COUNT(*) FILTER (WHERE operation_type = 'generation') as generation_count
  FROM ai_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE);
END;
$$;


--
-- Name: get_web_page_versions(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_page_versions(p_web_page_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, version integer, title text, content_hash character varying, word_count integer, change_type character varying, diff_summary text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    wpv.id,
    wpv.version,
    wpv.title,
    wpv.content_hash,
    wpv.word_count,
    wpv.change_type,
    wpv.diff_summary,
    wpv.created_at
  FROM web_page_versions wpv
  WHERE wpv.web_page_id = p_web_page_id
  ORDER BY wpv.version DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


--
-- Name: get_web_source_files_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_source_files_stats(p_source_id uuid) RETURNS TABLE(total_files bigint, downloaded_files bigint, indexed_files bigint, failed_files bigint, total_size_bytes bigint, total_chunks bigint, by_type jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_files,
    COUNT(*) FILTER (WHERE is_downloaded = true)::BIGINT as downloaded_files,
    COUNT(*) FILTER (WHERE is_indexed = true)::BIGINT as indexed_files,
    COUNT(*) FILTER (WHERE download_error IS NOT NULL OR parse_error IS NOT NULL)::BIGINT as failed_files,
    COALESCE(SUM(file_size), 0)::BIGINT as total_size_bytes,
    COALESCE(SUM(chunks_count), 0)::BIGINT as total_chunks,
    jsonb_object_agg(
      COALESCE(wf.file_type, 'unknown'),
      type_count
    ) as by_type
  FROM web_files wf
  LEFT JOIN LATERAL (
    SELECT file_type, COUNT(*) as type_count
    FROM web_files
    WHERE web_source_id = p_source_id
    GROUP BY file_type
  ) type_stats ON wf.file_type = type_stats.file_type
  WHERE wf.web_source_id = p_source_id;
END;
$$;


--
-- Name: get_web_sources_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_web_sources_stats() RETURNS TABLE(total_sources bigint, active_sources bigint, healthy_sources bigint, failing_sources bigint, total_pages bigint, indexed_pages bigint, pending_jobs bigint, running_jobs bigint, by_category jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM web_sources)::BIGINT as total_sources,
    (SELECT COUNT(*) FROM web_sources WHERE is_active = true)::BIGINT as active_sources,
    (SELECT COUNT(*) FROM web_sources WHERE health_status = 'healthy')::BIGINT as healthy_sources,
    (SELECT COUNT(*) FROM web_sources WHERE health_status = 'failing')::BIGINT as failing_sources,
    (SELECT COUNT(*) FROM web_pages)::BIGINT as total_pages,
    (SELECT COUNT(*) FROM web_pages WHERE is_indexed = true)::BIGINT as indexed_pages,
    (SELECT COUNT(*) FROM web_crawl_jobs WHERE status = 'pending')::BIGINT as pending_jobs,
    (SELECT COUNT(*) FROM web_crawl_jobs WHERE status = 'running')::BIGINT as running_jobs,
    (
      SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM web_sources
        WHERE is_active = true
        GROUP BY category
      ) sub
    ) as by_category;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nom, prenom)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nom', ''),
    COALESCE(NEW.raw_user_meta_data->>'prenom', '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: increment_ai_query_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_ai_query_count(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_reset_date DATE;
BEGIN
  -- Récupérer ou créer les feature flags
  INSERT INTO feature_flags (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Récupérer les valeurs actuelles
  SELECT monthly_ai_queries_limit, monthly_ai_queries_used, quota_reset_date
  INTO v_limit, v_used, v_reset_date
  FROM feature_flags
  WHERE user_id = p_user_id;

  -- Réinitialiser si nouveau mois
  IF v_reset_date < DATE_TRUNC('month', CURRENT_DATE) THEN
    UPDATE feature_flags
    SET monthly_ai_queries_used = 1,
        quota_reset_date = DATE_TRUNC('month', CURRENT_DATE)
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  -- Vérifier le quota
  IF v_used >= v_limit THEN
    RETURN FALSE;
  END IF;

  -- Incrémenter
  UPDATE feature_flags
  SET monthly_ai_queries_used = monthly_ai_queries_used + 1
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$;


--
-- Name: increment_rule_match(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_rule_match(p_rule_id uuid, p_is_correct boolean DEFAULT NULL::boolean) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE source_classification_rules
  SET
    times_matched = times_matched + 1,
    times_correct = CASE
      WHEN p_is_correct = true THEN times_correct + 1
      ELSE times_correct
    END,
    last_matched_at = NOW(),
    updated_at = NOW()
  WHERE id = p_rule_id;
END;
$$;


--
-- Name: log_ai_usage(uuid, text, text, text, integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_ai_usage(p_user_id uuid, p_operation_type text, p_provider text, p_model text, p_input_tokens integer, p_output_tokens integer DEFAULT 0, p_context jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $_$
DECLARE
  v_cost_usd DECIMAL(10, 6);
  v_log_id UUID;
BEGIN
  -- Calculer le coût estimé
  IF p_provider = 'openai' THEN
    -- text-embedding-3-small: $0.02 / 1M tokens
    v_cost_usd := (p_input_tokens::DECIMAL / 1000000) * 0.02;
  ELSIF p_provider = 'anthropic' THEN
    -- Claude 3.5 Sonnet: $3 / 1M input, $15 / 1M output
    v_cost_usd := (p_input_tokens::DECIMAL / 1000000) * 3.0 +
                  (p_output_tokens::DECIMAL / 1000000) * 15.0;
  ELSE
    v_cost_usd := 0;
  END IF;

  INSERT INTO ai_usage_logs (
    user_id, operation_type, provider, model,
    input_tokens, output_tokens, estimated_cost_usd, context
  ) VALUES (
    p_user_id, p_operation_type, p_provider, p_model,
    p_input_tokens, p_output_tokens, v_cost_usd, p_context
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$_$;


--
-- Name: log_user_activity(uuid, character varying, character varying, character varying, uuid, character varying, jsonb, character varying, text, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_user_activity(p_user_id uuid, p_user_email character varying, p_action character varying, p_resource_type character varying, p_resource_id uuid DEFAULT NULL::uuid, p_resource_label character varying DEFAULT NULL::character varying, p_details jsonb DEFAULT NULL::jsonb, p_ip_address character varying DEFAULT NULL::character varying, p_user_agent text DEFAULT NULL::text, p_session_id character varying DEFAULT NULL::character varying) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO user_activity_logs (
    user_id, user_email, action, resource_type,
    resource_id, resource_label, details,
    ip_address, user_agent, session_id
  ) VALUES (
    p_user_id, p_user_email, p_action, p_resource_type,
    p_resource_id, p_resource_label, p_details,
    p_ip_address, p_user_agent, p_session_id
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;


--
-- Name: mark_all_notifications_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_all_notifications_read(p_admin_id uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  count_updated INTEGER;
BEGIN
  UPDATE admin_notifications
  SET
    is_read = TRUE,
    read_at = NOW(),
    read_by = p_admin_id
  WHERE is_read = FALSE;

  GET DIAGNOSTICS count_updated = ROW_COUNT;
  RETURN count_updated;
END;
$$;


--
-- Name: mark_media_as_expired(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_media_as_expired() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_expired = true AND OLD.is_expired = false THEN
    -- Logger expiration
    RAISE NOTICE 'Media % expired. Use Supabase Storage URL: %', NEW.media_id, NEW.storage_url;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: mark_notification_read(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notification_read(p_notification_id uuid, p_admin_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE admin_notifications
  SET
    is_read = TRUE,
    read_at = NOW(),
    read_by = p_admin_id
  WHERE id = p_notification_id AND is_read = FALSE;

  RETURN FOUND;
END;
$$;


--
-- Name: mark_source_as_banned(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_source_as_banned(p_source_id uuid, p_reason text, p_confidence text, p_retry_after_ms integer DEFAULT 3600000) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO web_source_ban_status (
    web_source_id,
    is_banned,
    banned_at,
    retry_after,
    reason,
    detection_confidence
  )
  VALUES (
    p_source_id,
    TRUE,
    NOW(),
    NOW() + (p_retry_after_ms || ' milliseconds')::INTERVAL,
    p_reason,
    p_confidence
  )
  ON CONFLICT (web_source_id)
  DO UPDATE SET
    is_banned = TRUE,
    banned_at = NOW(),
    retry_after = NOW() + (p_retry_after_ms || ' milliseconds')::INTERVAL,
    reason = p_reason,
    detection_confidence = p_confidence,
    updated_at = NOW();
END;
$$;


--
-- Name: marquer_facture_payee_flouci(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marquer_facture_payee_flouci() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Si transaction completed, marquer facture comme PAYEE
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE factures
    SET
      statut = 'PAYEE',
      date_paiement = NEW.completed_at,
      mode_paiement = 'flouci',
      updated_at = now()
    WHERE id = NEW.facture_id
      AND statut != 'PAYEE'; -- Éviter double paiement

    -- Log
    RAISE NOTICE 'Facture % marquée PAYÉE via Flouci (transaction %)', NEW.facture_id, NEW.flouci_payment_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: nettoyer_transactions_flouci_expirees(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nettoyer_transactions_flouci_expirees() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Marquer comme expired les transactions pending/initiated au-delà de expired_at
  UPDATE flouci_transactions
  SET
    status = 'expired',
    updated_at = now()
  WHERE status IN ('pending', 'initiated')
    AND expired_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;


--
-- Name: normalize_phone_tn(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_phone_tn(phone text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
BEGIN
  -- Retourner NULL si input NULL ou vide
  IF phone IS NULL OR TRIM(phone) = '' THEN
    RETURN NULL;
  END IF;

  -- Supprimer espaces, tirets, parenthèses, points
  phone := REGEXP_REPLACE(phone, '[^0-9+]', '', 'g');

  -- Convertir format local vers E.164
  -- Format local tunisien : 8 chiffres commençant par 2-9 (ex: 20123456, 98765432)
  IF phone ~ '^[2-9][0-9]{7}$' THEN
    RETURN '+216' || phone;

  -- Format E.164 déjà correct : +216 + 8 chiffres
  ELSIF phone ~ '^\+216[2-9][0-9]{7}$' THEN
    RETURN phone;

  -- Format international 00 : 00216 + 8 chiffres
  ELSIF phone ~ '^00216[2-9][0-9]{7}$' THEN
    RETURN '+' || SUBSTRING(phone FROM 3);

  -- Format avec indicatif 216 sans + : 216 + 8 chiffres
  ELSIF phone ~ '^216[2-9][0-9]{7}$' THEN
    RETURN '+' || phone;

  -- Format invalide : retourner tel quel pour debug
  ELSE
    RETURN phone;
  END IF;
END;
$_$;


--
-- Name: notify_new_registration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_registration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Créer une notification seulement si le nouveau user est en pending
  IF NEW.status = 'pending' THEN
    INSERT INTO admin_notifications (
      notification_type,
      priority,
      title,
      message,
      target_type,
      target_id,
      metadata
    ) VALUES (
      'new_registration',
      'high',
      'Nouvelle demande d''inscription',
      format('L''utilisateur %s (%s) demande l''accès à la plateforme.',
        COALESCE(NEW.prenom || ' ' || NEW.nom, NEW.email),
        NEW.email
      ),
      'user',
      NEW.id,
      jsonb_build_object(
        'user_email', NEW.email,
        'user_name', COALESCE(NEW.prenom || ' ' || NEW.nom, NEW.email),
        'registered_at', NOW()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_plan_expiring(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_plan_expiring() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Si le plan expire dans les 7 prochains jours
  IF NEW.plan_expires_at IS NOT NULL
     AND NEW.plan_expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
     AND (OLD.plan_expires_at IS NULL OR OLD.plan_expires_at != NEW.plan_expires_at) THEN
    INSERT INTO admin_notifications (
      notification_type,
      priority,
      title,
      message,
      target_type,
      target_id,
      metadata,
      expires_at
    ) VALUES (
      'plan_expiring',
      'normal',
      'Plan utilisateur expire bientôt',
      format('Le plan %s de %s expire le %s.',
        NEW.plan,
        NEW.email,
        TO_CHAR(NEW.plan_expires_at, 'DD/MM/YYYY')
      ),
      'user',
      NEW.id,
      jsonb_build_object(
        'user_email', NEW.email,
        'plan', NEW.plan,
        'expires_at', NEW.plan_expires_at
      ),
      NEW.plan_expires_at
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: restore_knowledge_base_version(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_knowledge_base_version(p_knowledge_base_id uuid, p_version_id uuid, p_restored_by uuid, p_reason text DEFAULT 'Restauration de version'::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_version_data RECORD;
BEGIN
  -- Récupérer les données de la version à restaurer
  SELECT * INTO v_version_data
  FROM knowledge_base_versions
  WHERE id = p_version_id AND knowledge_base_id = p_knowledge_base_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version non trouvée';
  END IF;

  -- Créer d'abord une version de sauvegarde de l'état actuel
  PERFORM create_knowledge_base_version(
    p_knowledge_base_id,
    p_restored_by,
    'Sauvegarde avant restauration vers version ' || v_version_data.version,
    'update'
  );

  -- Restaurer les données
  UPDATE knowledge_base
  SET
    title = v_version_data.title,
    description = v_version_data.description,
    full_text = v_version_data.full_text,
    source_file = v_version_data.source_file,
    metadata = v_version_data.metadata,
    category = v_version_data.category,
    subcategory = v_version_data.subcategory,
    tags = v_version_data.tags,
    language = v_version_data.language,
    is_indexed = false, -- Nécessite ré-indexation
    updated_at = NOW()
  WHERE id = p_knowledge_base_id;

  -- Créer une entrée de version pour la restauration
  PERFORM create_knowledge_base_version(
    p_knowledge_base_id,
    p_restored_by,
    p_reason || ' (depuis version ' || v_version_data.version || ')',
    'restore'
  );

  RETURN TRUE;
END;
$$;


--
-- Name: search_document_embeddings(public.vector, uuid, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_embeddings(query_embedding public.vector, p_user_id uuid, p_limit integer DEFAULT 10, p_threshold double precision DEFAULT 0.7) RETURNS TABLE(document_id uuid, document_name character varying, content_chunk text, chunk_index integer, similarity double precision, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    d.nom as document_name,
    de.content_chunk,
    de.chunk_index,
    (1 - (de.embedding <=> query_embedding))::FLOAT as similarity,
    de.metadata
  FROM document_embeddings de
  JOIN documents d ON de.document_id = d.id
  WHERE de.user_id = p_user_id
    AND (1 - (de.embedding <=> query_embedding)) >= p_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;


--
-- Name: search_dossier_embeddings(public.vector, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_dossier_embeddings(query_embedding public.vector, p_dossier_id uuid, p_user_id uuid, p_limit integer DEFAULT 10) RETURNS TABLE(document_id uuid, document_name character varying, content_chunk text, chunk_index integer, similarity double precision, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    d.nom as document_name,
    de.content_chunk,
    de.chunk_index,
    (1 - (de.embedding <=> query_embedding))::FLOAT as similarity,
    de.metadata
  FROM document_embeddings de
  JOIN documents d ON de.document_id = d.id
  WHERE de.user_id = p_user_id
    AND d.dossier_id = p_dossier_id
  ORDER BY de.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;


--
-- Name: search_dossier_embeddings(public.vector, uuid, uuid, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_dossier_embeddings(query_embedding public.vector, p_dossier_id uuid, p_user_id uuid, p_limit integer DEFAULT 10, p_similarity_threshold double precision DEFAULT 0.5) RETURNS TABLE(document_id uuid, chunk_index integer, content_chunk text, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    de.chunk_index,
    de.content_chunk,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM document_embeddings de
  JOIN documents d ON d.id = de.document_id
  WHERE
    d.dossier_id = p_dossier_id
    AND d.user_id = p_user_id
    AND 1 - (de.embedding <=> query_embedding) >= p_similarity_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;


--
-- Name: search_jurisprudence(public.vector, text, text, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_jurisprudence(query_embedding public.vector, p_domain text DEFAULT NULL::text, p_court text DEFAULT NULL::text, p_limit integer DEFAULT 10, p_threshold double precision DEFAULT 0.6) RETURNS TABLE(id uuid, court text, chamber text, decision_number text, decision_date date, domain text, summary text, articles_cited text[], similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.court,
    j.chamber,
    j.decision_number,
    j.decision_date,
    j.domain,
    j.summary,
    j.articles_cited,
    (1 - (j.embedding <=> query_embedding))::FLOAT as similarity
  FROM jurisprudence j
  WHERE j.embedding IS NOT NULL
    AND (p_domain IS NULL OR j.domain = p_domain)
    AND (p_court IS NULL OR j.court = p_court)
    AND (1 - (j.embedding <=> query_embedding)) >= p_threshold
  ORDER BY j.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;


--
-- Name: search_jurisprudence_by_article(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_jurisprudence_by_article(p_article text, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, court text, decision_number text, decision_date date, domain text, summary text, articles_cited text[])
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.court,
    j.decision_number,
    j.decision_date,
    j.domain,
    j.summary,
    j.articles_cited
  FROM jurisprudence j
  WHERE p_article = ANY(j.articles_cited)
  ORDER BY j.decision_date DESC NULLS LAST
  LIMIT p_limit;
END;
$$;


--
-- Name: search_knowledge_base(public.vector, text, text, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_knowledge_base(query_embedding public.vector, p_category text DEFAULT NULL::text, p_subcategory text DEFAULT NULL::text, p_limit integer DEFAULT 10, p_threshold double precision DEFAULT 0.5) RETURNS TABLE(knowledge_base_id uuid, chunk_id uuid, title text, description text, category text, subcategory character varying, language character varying, chunk_content text, chunk_index integer, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id AS knowledge_base_id,
    c.id AS chunk_id,
    kb.title,
    kb.description,
    kb.category,
    kb.subcategory,
    kb.language,
    c.content AS chunk_content,
    c.chunk_index,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
  FROM knowledge_base_chunks c
  JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
  WHERE kb.is_active = TRUE
    AND kb.is_indexed = TRUE
    AND (p_category IS NULL OR kb.category = p_category)
    AND (p_subcategory IS NULL OR kb.subcategory = p_subcategory)
    AND (1 - (c.embedding <=> query_embedding)) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: set_commission_flouci(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_commission_flouci() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Calculer commission si pas déjà définie
  IF NEW.commission_flouci IS NULL OR NEW.commission_flouci = 0 THEN
    NEW.commission_flouci := calculer_commission_flouci(NEW.montant);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trigger_create_initial_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_create_initial_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Créer la version initiale
  PERFORM create_knowledge_base_version(
    NEW.id,
    NEW.uploaded_by,
    'Version initiale',
    'create'
  );
  RETURN NEW;
END;
$$;


--
-- Name: trigger_daily_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_daily_notifications() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  response_id bigint;
  cron_secret text;
  function_url text;
BEGIN
  -- Récupérer les variables depuis secrets Supabase
  cron_secret := current_setting('app.settings.cron_secret', true);
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notifications';
  
  -- Si pas configuré, utiliser valeurs par défaut
  IF cron_secret IS NULL THEN
    cron_secret := 'change-me-in-production';
  END IF;
  
  IF function_url IS NULL OR function_url = '/functions/v1/send-notifications' THEN
    function_url := 'https://vgaofkucdpydyblrykbh.supabase.co/functions/v1/send-notifications';
  END IF;

  -- Appeler l'Edge Function via pg_net
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb
  ) INTO response_id;

  -- Logger le résultat
  RAISE NOTICE 'Notifications déclenchées, request_id: %', response_id;
END;
$$;


--
-- Name: unban_source(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unban_source(p_source_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE web_source_ban_status
  SET
    is_banned = FALSE,
    updated_at = NOW()
  WHERE web_source_id = p_source_id;
END;
$$;


--
-- Name: update_crawler_success_rate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_crawler_success_rate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.total_requests > 0 THEN
    NEW.success_rate := (NEW.successful_requests::NUMERIC / NEW.total_requests::NUMERIC) * 100;
  ELSE
    NEW.success_rate := 0;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_enfant_age(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_enfant_age() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Calculer âge actuel
  NEW.age_actuel := EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.date_naissance))::INTEGER;

  -- Déterminer si mineur (< 18 ans)
  NEW.est_mineur := (NEW.age_actuel < 18);

  RETURN NEW;
END;
$$;


--
-- Name: update_jurisprudence_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_jurisprudence_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE jurisprudence_stats
  SET
    total_decisions = (SELECT COUNT(*) FROM jurisprudence),
    decisions_by_domain = (
      SELECT jsonb_object_agg(domain, count)
      FROM (SELECT domain, COUNT(*) as count FROM jurisprudence GROUP BY domain) sub
    ),
    decisions_by_court = (
      SELECT jsonb_object_agg(court, count)
      FROM (SELECT court, COUNT(*) as count FROM jurisprudence GROUP BY court) sub
    ),
    updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_pages_freshness(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pages_freshness() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  WITH updated AS (
    UPDATE web_pages
    SET freshness_score = GREATEST(0, 1 - (
      EXTRACT(EPOCH FROM (NOW() - COALESCE(last_crawled_at, created_at))) /
      (30 * 24 * 3600)  -- Décroissance sur 30 jours
    ))
    WHERE is_indexed = true
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;


--
-- Name: update_platform_config_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_platform_config_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_templates_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_templates_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


--
-- Name: validate_user_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_user_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Les super_admin peuvent passer à n'importe quel status
  -- Empêcher les transitions invalides
  IF OLD.status = 'rejected' AND NEW.status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Un compte rejeté ne peut pas passer directement à %', NEW.status;
  END IF;

  -- Mettre à jour les timestamps appropriés
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    NEW.approved_at = NOW();
    NEW.is_approved = TRUE;
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    NEW.rejected_at = NOW();
    NEW.is_approved = FALSE;
  ELSIF NEW.status = 'suspended' AND OLD.status != 'suspended' THEN
    NEW.suspended_at = NOW();
    NEW.is_approved = FALSE;
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    id integer NOT NULL,
    name character varying(500) NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: _migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public._migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: _migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public._migrations_id_seq OWNED BY public._migrations.id;


--
-- Name: actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.actions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    dossier_id uuid NOT NULL,
    titre character varying(255) NOT NULL,
    description text,
    type_action character varying(100),
    statut character varying(50) DEFAULT 'a_faire'::character varying,
    date_action date,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT actions_statut_check CHECK (((statut)::text = ANY ((ARRAY['a_faire'::character varying, 'en_cours'::character varying, 'termine'::character varying])::text[])))
);


--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_type character varying(50) NOT NULL,
    priority character varying(20) DEFAULT 'normal'::character varying,
    title character varying(255) NOT NULL,
    message text,
    target_type character varying(50),
    target_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    read_by uuid,
    is_actioned boolean DEFAULT false,
    actioned_at timestamp without time zone,
    actioned_by uuid,
    action_result character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    CONSTRAINT admin_notifications_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    nom character varying(100),
    prenom character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    role character varying(20) DEFAULT 'user'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    is_approved boolean DEFAULT false,
    approved_by uuid,
    approved_at timestamp without time zone,
    rejected_at timestamp without time zone,
    suspended_at timestamp without time zone,
    rejection_reason text,
    suspension_reason text,
    last_login_at timestamp without time zone,
    login_count integer DEFAULT 0,
    plan character varying(20) DEFAULT 'free'::character varying,
    plan_expires_at timestamp without time zone,
    email_verified boolean DEFAULT false,
    email_verification_token character varying(255),
    email_verification_expires timestamp without time zone,
    CONSTRAINT users_plan_check CHECK (((plan)::text = ANY ((ARRAY['free'::character varying, 'pro'::character varying, 'enterprise'::character varying])::text[]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'suspended'::character varying])::text[])))
);


--
-- Name: active_admin_notifications; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_admin_notifications AS
 SELECT n.id,
    n.notification_type,
    n.priority,
    n.title,
    n.message,
    n.target_type,
    n.target_id,
    n.metadata,
    n.is_read,
    n.read_at,
    n.read_by,
    n.is_actioned,
    n.actioned_at,
    n.actioned_by,
    n.action_result,
    n.created_at,
    n.expires_at,
    u.email AS target_email,
    u.nom AS target_nom,
    u.prenom AS target_prenom
   FROM (public.admin_notifications n
     LEFT JOIN public.users u ON ((((n.target_type)::text = 'user'::text) AND (n.target_id = u.id))))
  WHERE ((n.is_read = false) AND ((n.expires_at IS NULL) OR (n.expires_at > now())))
  ORDER BY
        CASE n.priority
            WHEN 'urgent'::text THEN 1
            WHEN 'high'::text THEN 2
            WHEN 'normal'::text THEN 3
            WHEN 'low'::text THEN 4
            ELSE NULL::integer
        END, n.created_at DESC;


--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    admin_email character varying(255) NOT NULL,
    action_type character varying(50) NOT NULL,
    target_type character varying(50) NOT NULL,
    target_id uuid,
    target_identifier character varying(255),
    old_value jsonb,
    new_value jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    operation_type text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0,
    output_tokens integer DEFAULT 0,
    estimated_cost_usd numeric(10,6) DEFAULT 0,
    context jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    cost_usd numeric(10,6) DEFAULT 0,
    CONSTRAINT ai_usage_logs_operation_type_check CHECK ((operation_type = ANY (ARRAY['embedding'::text, 'chat'::text, 'generation'::text, 'classification'::text, 'extraction'::text]))),
    CONSTRAINT ai_usage_logs_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'anthropic'::text])))
);


--
-- Name: ai_costs_by_user_month; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_costs_by_user_month AS
 SELECT sub.user_id,
    date_trunc('month'::text, sub.created_at) AS month,
    count(*) AS total_operations,
    sum(sub.input_tokens) AS total_input_tokens,
    sum(sub.output_tokens) AS total_output_tokens,
    sum(sub.estimated_cost_usd) AS total_cost_usd,
    jsonb_object_agg(sub.operation_type, sub.operation_count) AS operations_breakdown
   FROM ( SELECT ai_usage_logs.user_id,
            ai_usage_logs.created_at,
            ai_usage_logs.input_tokens,
            ai_usage_logs.output_tokens,
            ai_usage_logs.estimated_cost_usd,
            ai_usage_logs.operation_type,
            count(*) OVER (PARTITION BY ai_usage_logs.user_id, (date_trunc('month'::text, ai_usage_logs.created_at)), ai_usage_logs.operation_type) AS operation_count
           FROM public.ai_usage_logs) sub
  GROUP BY sub.user_id, (date_trunc('month'::text, sub.created_at));


--
-- Name: ai_costs_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_costs_daily AS
 SELECT date(ai_usage_logs.created_at) AS date,
    ai_usage_logs.provider,
    count(*) AS total_operations,
    sum(ai_usage_logs.input_tokens) AS total_input_tokens,
    sum(ai_usage_logs.output_tokens) AS total_output_tokens,
    sum(ai_usage_logs.estimated_cost_usd) AS total_cost_usd
   FROM public.ai_usage_logs
  GROUP BY (date(ai_usage_logs.created_at)), ai_usage_logs.provider
  ORDER BY (date(ai_usage_logs.created_at)) DESC;


--
-- Name: audit_logs_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.audit_logs_view AS
 SELECT al.id,
    al.admin_id,
    al.admin_email,
    al.action_type,
    al.target_type,
    al.target_id,
    al.target_identifier,
    al.old_value,
    al.new_value,
    al.ip_address,
    al.created_at,
        CASE al.action_type
            WHEN 'user_approved'::text THEN 'Utilisateur approuvé'::character varying
            WHEN 'user_rejected'::text THEN 'Utilisateur rejeté'::character varying
            WHEN 'user_suspended'::text THEN 'Utilisateur suspendu'::character varying
            WHEN 'user_reactivated'::text THEN 'Utilisateur réactivé'::character varying
            WHEN 'role_changed'::text THEN 'Rôle modifié'::character varying
            WHEN 'plan_changed'::text THEN 'Plan modifié'::character varying
            WHEN 'kb_upload'::text THEN 'Document uploadé (KB)'::character varying
            WHEN 'kb_delete'::text THEN 'Document supprimé (KB)'::character varying
            WHEN 'kb_index'::text THEN 'Document indexé (KB)'::character varying
            WHEN 'config_updated'::text THEN 'Configuration mise à jour'::character varying
            ELSE al.action_type
        END AS action_label
   FROM public.admin_audit_logs al
  ORDER BY al.created_at DESC;


--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    dossier_id uuid,
    title text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    summary text,
    summary_updated_at timestamp with time zone,
    summary_message_count integer DEFAULT 0
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    sources jsonb,
    tokens_used integer,
    model text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: classification_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classification_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_page_id uuid,
    original_category text,
    original_domain text,
    original_document_type text,
    original_confidence double precision,
    corrected_category text,
    corrected_domain text,
    corrected_document_type text,
    page_url text,
    page_structure jsonb,
    corrected_by uuid,
    corrected_at timestamp with time zone DEFAULT now(),
    page_title text,
    classification_signals jsonb DEFAULT '{}'::jsonb,
    used_for_learning boolean DEFAULT false,
    generated_rule_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: classification_learning_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classification_learning_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid,
    learned_from_page_id uuid,
    learned_by_user_id uuid,
    pattern_type text NOT NULL,
    pattern_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    nom character varying(255) NOT NULL,
    prenom character varying(255),
    type_client character varying(50) DEFAULT 'personne_physique'::character varying,
    cin character varying(50),
    adresse text,
    telephone character varying(50),
    email character varying(255),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    denomination character varying(255),
    code_postal character varying(20),
    ville character varying(255),
    registre_commerce character varying(100),
    CONSTRAINT clients_type_client_check CHECK (((type_client)::text = ANY ((ARRAY['personne_physique'::character varying, 'personne_morale'::character varying])::text[])))
);


--
-- Name: cloud_providers_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cloud_providers_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(50) NOT NULL,
    enabled boolean DEFAULT false,
    access_token text,
    refresh_token text,
    token_expiry timestamp without time zone,
    folder_id character varying(255),
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT cloud_providers_config_provider_check CHECK (((provider)::text = ANY ((ARRAY['google_drive'::character varying, 'onedrive'::character varying, 'dropbox'::character varying])::text[])))
);


--
-- Name: content_contradictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_contradictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_page_id uuid NOT NULL,
    target_page_id uuid,
    contradiction_type text NOT NULL,
    severity text DEFAULT 'medium'::text,
    description text NOT NULL,
    source_excerpt text,
    target_excerpt text,
    similarity_score double precision,
    legal_impact text,
    suggested_resolution text,
    affected_references jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'pending'::text,
    resolution_notes text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_action text,
    llm_provider text,
    llm_model text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT content_contradictions_contradiction_type_check CHECK ((contradiction_type = ANY (ARRAY['version_conflict'::text, 'interpretation_conflict'::text, 'date_conflict'::text, 'legal_update'::text, 'doctrine_vs_practice'::text, 'cross_reference_error'::text]))),
    CONSTRAINT content_contradictions_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT content_contradictions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'under_review'::text, 'resolved'::text, 'dismissed'::text, 'escalated'::text])))
);


--
-- Name: content_quality_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_quality_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_page_id uuid NOT NULL,
    overall_score integer NOT NULL,
    clarity_score integer,
    structure_score integer,
    completeness_score integer,
    reliability_score integer,
    freshness_score integer,
    relevance_score integer,
    analysis_summary text,
    detected_issues jsonb DEFAULT '[]'::jsonb,
    recommendations jsonb DEFAULT '[]'::jsonb,
    legal_references jsonb DEFAULT '[]'::jsonb,
    document_date date,
    document_type_detected text,
    jurisdiction text,
    requires_review boolean DEFAULT false,
    review_reason text,
    llm_provider text,
    llm_model text,
    tokens_used integer,
    processing_time_ms integer,
    assessed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT content_quality_assessments_clarity_score_check CHECK (((clarity_score >= 0) AND (clarity_score <= 100))),
    CONSTRAINT content_quality_assessments_completeness_score_check CHECK (((completeness_score >= 0) AND (completeness_score <= 100))),
    CONSTRAINT content_quality_assessments_freshness_score_check CHECK (((freshness_score >= 0) AND (freshness_score <= 100))),
    CONSTRAINT content_quality_assessments_overall_score_check CHECK (((overall_score >= 0) AND (overall_score <= 100))),
    CONSTRAINT content_quality_assessments_relevance_score_check CHECK (((relevance_score >= 0) AND (relevance_score <= 100))),
    CONSTRAINT content_quality_assessments_reliability_score_check CHECK (((reliability_score >= 0) AND (reliability_score <= 100))),
    CONSTRAINT content_quality_assessments_structure_score_check CHECK (((structure_score >= 0) AND (structure_score <= 100)))
);


--
-- Name: crawler_health_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crawler_health_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_source_id uuid NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    total_requests integer DEFAULT 0 NOT NULL,
    successful_requests integer DEFAULT 0 NOT NULL,
    failed_requests integer DEFAULT 0 NOT NULL,
    success_rate numeric(5,2),
    errors_429 integer DEFAULT 0 NOT NULL,
    errors_403 integer DEFAULT 0 NOT NULL,
    errors_503 integer DEFAULT 0 NOT NULL,
    errors_5xx integer DEFAULT 0 NOT NULL,
    ban_detections integer DEFAULT 0 NOT NULL,
    avg_response_time_ms integer,
    median_response_time_ms integer,
    p95_response_time_ms integer,
    pages_this_hour integer DEFAULT 0 NOT NULL,
    pages_this_day integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid,
    user_id uuid,
    content_chunk text NOT NULL,
    chunk_index integer NOT NULL,
    embedding public.vector(1024) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    dossier_id uuid,
    nom character varying(255) NOT NULL,
    type character varying(100),
    chemin_fichier text NOT NULL,
    taille_fichier bigint,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossiers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid,
    numero character varying(100) NOT NULL,
    objet text NOT NULL,
    type_procedure character varying(100),
    statut character varying(50) DEFAULT 'en_cours'::character varying,
    tribunal character varying(255),
    adverse_partie text,
    date_ouverture date DEFAULT CURRENT_DATE,
    date_cloture date,
    notes text,
    workflow_statut character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT dossiers_statut_check CHECK (((statut)::text = ANY ((ARRAY['en_cours'::character varying, 'clos'::character varying, 'archive'::character varying])::text[])))
);


--
-- Name: echeances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.echeances (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    dossier_id uuid,
    titre character varying(255) NOT NULL,
    description text,
    date_echeance date NOT NULL,
    type character varying(100),
    rappel_jours integer DEFAULT 7,
    terminee boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    statut character varying(50) DEFAULT 'actif'::character varying,
    type_echeance character varying(50),
    CONSTRAINT echeances_statut_check CHECK (((statut)::text = ANY ((ARRAY['actif'::character varying, 'termine'::character varying, 'annule'::character varying])::text[])))
);


--
-- Name: factures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factures (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    dossier_id uuid,
    client_id uuid,
    numero character varying(100) NOT NULL,
    date_emission date DEFAULT CURRENT_DATE,
    date_echeance date,
    montant_ht numeric(15,2) NOT NULL,
    montant_tva numeric(15,2) DEFAULT 0,
    montant_ttc numeric(15,2) NOT NULL,
    statut character varying(50) DEFAULT 'brouillon'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT factures_statut_check CHECK (((statut)::text = ANY ((ARRAY['brouillon'::character varying, 'envoyee'::character varying, 'payee'::character varying, 'annulee'::character varying])::text[])))
);


--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    enable_semantic_search boolean DEFAULT false,
    enable_ai_chat boolean DEFAULT false,
    enable_ai_generation boolean DEFAULT false,
    enable_auto_classification boolean DEFAULT false,
    monthly_ai_queries_limit integer DEFAULT 100,
    monthly_ai_queries_used integer DEFAULT 0,
    quota_reset_date date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: flouci_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flouci_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    facture_id uuid,
    payment_id character varying(255),
    montant numeric(15,2) NOT NULL,
    statut character varying(50) DEFAULT 'pending'::character varying,
    webhook_data jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: human_review_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.human_review_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_type text NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    context jsonb DEFAULT '{}'::jsonb,
    suggested_actions jsonb DEFAULT '[]'::jsonb,
    quality_score integer,
    confidence_score double precision,
    priority text DEFAULT 'normal'::text,
    status text DEFAULT 'pending'::text,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    decision text,
    decision_notes text,
    modifications_made jsonb DEFAULT '{}'::jsonb,
    completed_by uuid,
    completed_at timestamp with time zone,
    time_to_decision_ms integer,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT human_review_queue_decision_check CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text, 'modify'::text, 'escalate'::text, 'defer'::text]))),
    CONSTRAINT human_review_queue_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT human_review_queue_review_type_check CHECK ((review_type = ANY (ARRAY['classification_uncertain'::text, 'quality_low'::text, 'contradiction_detected'::text, 'content_ambiguous'::text, 'source_reliability'::text, 'legal_update_detected'::text, 'duplicate_suspected'::text, 'manual_request'::text]))),
    CONSTRAINT human_review_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text, 'expired'::text]))),
    CONSTRAINT human_review_queue_target_type_check CHECK ((target_type = ANY (ARRAY['web_page'::text, 'contradiction'::text, 'classification'::text, 'quality_assessment'::text])))
);


--
-- Name: indexing_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indexing_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_type text NOT NULL,
    target_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    priority integer DEFAULT 5,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT indexing_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['document'::text, 'knowledge_base'::text, 'reindex'::text]))),
    CONSTRAINT indexing_jobs_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT indexing_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: user_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_email character varying(255) NOT NULL,
    action character varying(50) NOT NULL,
    resource_type character varying(50) NOT NULL,
    resource_id uuid,
    resource_label character varying(255),
    details jsonb,
    ip_address character varying(45),
    user_agent text,
    session_id character varying(255),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: inpdp_data_access_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.inpdp_data_access_report AS
 SELECT ual.user_email AS "Utilisateur",
    ual.action AS "Action",
    ual.resource_type AS "Type de donnée",
    ual.resource_label AS "Référence",
    ual.ip_address AS "Adresse IP",
    ual.created_at AS "Date et heure"
   FROM public.user_activity_logs ual
  WHERE (((ual.resource_type)::text = ANY ((ARRAY['client'::character varying, 'dossier'::character varying])::text[])) AND ((ual.action)::text = ANY ((ARRAY['client_view'::character varying, 'client_update'::character varying, 'client_delete'::character varying, 'dossier_view'::character varying, 'dossier_update'::character varying, 'dossier_delete'::character varying, 'export_clients'::character varying, 'export_dossiers'::character varying])::text[])))
  ORDER BY ual.created_at DESC;


--
-- Name: jurisprudence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisprudence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    court text NOT NULL,
    chamber text,
    decision_number text NOT NULL,
    decision_date date,
    domain text NOT NULL,
    summary text,
    full_text text,
    articles_cited text[],
    keywords text[],
    embedding public.vector(1024),
    source_file text,
    source_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT jurisprudence_domain_check CHECK ((domain = ANY (ARRAY['civil'::text, 'commercial'::text, 'famille'::text, 'penal'::text, 'administratif'::text, 'social'::text, 'foncier'::text])))
);


--
-- Name: jurisprudence_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisprudence_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    total_decisions integer DEFAULT 0,
    decisions_by_domain jsonb DEFAULT '{}'::jsonb,
    decisions_by_court jsonb DEFAULT '{}'::jsonb,
    last_import_date timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_bulk_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_bulk_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uploaded_by uuid NOT NULL,
    total_files integer DEFAULT 0 NOT NULL,
    completed_files integer DEFAULT 0 NOT NULL,
    failed_files integer DEFAULT 0 NOT NULL,
    status character varying(30) DEFAULT 'processing'::character varying NOT NULL,
    default_category character varying(50),
    default_language character varying(5) DEFAULT 'ar'::character varying,
    default_tags text[] DEFAULT '{}'::text[],
    auto_index boolean DEFAULT true,
    document_ids uuid[] DEFAULT '{}'::uuid[],
    errors jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kb_bulk_imports_status_check CHECK (((status)::text = ANY ((ARRAY['processing'::character varying, 'completed'::character varying, 'partially_completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: kb_document_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_document_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_document_id uuid NOT NULL,
    target_document_id uuid NOT NULL,
    relation_type character varying(30) NOT NULL,
    similarity_score double precision,
    contradiction_type character varying(50),
    contradiction_severity character varying(20),
    description text,
    source_excerpt text,
    target_excerpt text,
    suggested_resolution text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT kb_document_relations_contradiction_severity_check CHECK (((contradiction_severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT kb_document_relations_relation_type_check CHECK (((relation_type)::text = ANY ((ARRAY['duplicate'::character varying, 'near_duplicate'::character varying, 'contradiction'::character varying, 'related'::character varying])::text[]))),
    CONSTRAINT kb_document_relations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'dismissed'::character varying, 'resolved'::character varying])::text[])))
);


--
-- Name: knowledge_base; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    source_file text,
    full_text text,
    embedding public.vector(1024),
    is_indexed boolean DEFAULT false,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    language character varying(5) DEFAULT 'ar'::character varying NOT NULL,
    chunk_count integer DEFAULT 0,
    file_name character varying(500),
    file_type character varying(100),
    subcategory character varying(50),
    tags text[] DEFAULT '{}'::text[],
    version integer DEFAULT 1,
    is_active boolean DEFAULT true,
    quality_score integer,
    quality_clarity integer,
    quality_structure integer,
    quality_completeness integer,
    quality_reliability integer,
    quality_analysis_summary text,
    quality_detected_issues jsonb DEFAULT '[]'::jsonb,
    quality_recommendations jsonb DEFAULT '[]'::jsonb,
    quality_requires_review boolean DEFAULT false,
    quality_assessed_at timestamp with time zone,
    quality_llm_provider text,
    quality_llm_model text,
    bulk_import_id uuid,
    CONSTRAINT knowledge_base_category_check CHECK ((category = ANY (ARRAY['jurisprudence'::text, 'code'::text, 'doctrine'::text, 'modele'::text, 'autre'::text, 'legislation'::text, 'modeles'::text, 'procedures'::text, 'jort'::text, 'formulaires'::text]))),
    CONSTRAINT knowledge_base_language_check CHECK (((language)::text = ANY ((ARRAY['ar'::character varying, 'fr'::character varying])::text[])))
);


--
-- Name: knowledge_base_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    knowledge_base_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1024),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_base_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    knowledge_base_id uuid NOT NULL,
    version integer NOT NULL,
    title character varying(500),
    description text,
    full_text text,
    source_file text,
    metadata jsonb,
    category text,
    subcategory character varying(50),
    tags text[],
    language character varying(5),
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    change_reason text,
    change_type character varying(50) DEFAULT 'update'::character varying,
    CONSTRAINT knowledge_base_versions_change_type_check CHECK (((change_type)::text = ANY ((ARRAY['create'::character varying, 'update'::character varying, 'content_update'::character varying, 'file_replace'::character varying, 'restore'::character varying])::text[])))
);


--
-- Name: knowledge_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_categories (
    id character varying(50) NOT NULL,
    parent_id character varying(50),
    label_fr character varying(100) NOT NULL,
    label_ar character varying(100),
    icon character varying(50),
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: legal_classifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_classifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_page_id uuid NOT NULL,
    primary_category text NOT NULL,
    subcategory text,
    domain text,
    subdomain text,
    document_nature text,
    confidence_score double precision,
    requires_validation boolean DEFAULT false,
    validation_reason text,
    alternative_classifications jsonb DEFAULT '[]'::jsonb,
    legal_keywords jsonb DEFAULT '[]'::jsonb,
    validated_by uuid,
    validated_at timestamp with time zone,
    final_classification jsonb,
    validation_notes text,
    llm_provider text,
    llm_model text,
    tokens_used integer,
    classified_at timestamp with time zone DEFAULT now(),
    classification_source text,
    signals_used jsonb DEFAULT '[]'::jsonb,
    rules_matched text[] DEFAULT '{}'::text[],
    structure_hints jsonb,
    CONSTRAINT legal_classifications_classification_source_check CHECK ((classification_source = ANY (ARRAY['llm'::text, 'rules'::text, 'structure'::text, 'hybrid'::text]))),
    CONSTRAINT legal_classifications_confidence_score_check CHECK (((confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision))),
    CONSTRAINT legal_classifications_document_nature_check CHECK ((document_nature = ANY (ARRAY['loi'::text, 'decret'::text, 'arrete'::text, 'circulaire'::text, 'ordonnance'::text, 'arret'::text, 'jugement'::text, 'ordonnance_jud'::text, 'avis'::text, 'article_doctrine'::text, 'these'::text, 'commentaire'::text, 'note'::text, 'modele_contrat'::text, 'modele_acte'::text, 'formulaire'::text, 'guide_pratique'::text, 'faq'::text, 'actualite'::text, 'autre'::text]))),
    CONSTRAINT legal_classifications_domain_check CHECK ((domain = ANY (ARRAY['civil'::text, 'commercial'::text, 'penal'::text, 'famille'::text, 'fiscal'::text, 'social'::text, 'administratif'::text, 'immobilier'::text, 'bancaire'::text, 'propriete_intellectuelle'::text, 'international'::text, 'autre'::text]))),
    CONSTRAINT legal_classifications_primary_category_check CHECK ((primary_category = ANY (ARRAY['legislation'::text, 'jurisprudence'::text, 'doctrine'::text, 'jort'::text, 'modeles'::text, 'procedures'::text, 'formulaires'::text, 'actualites'::text, 'autre'::text])))
);


--
-- Name: legal_taxonomy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_taxonomy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type character varying(50) NOT NULL,
    code character varying(100),
    label_fr character varying(255) NOT NULL,
    label_ar character varying(255),
    description text,
    parent_id uuid,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    parent_code text,
    icon text,
    color text,
    is_system boolean DEFAULT false,
    suggested_by_ai boolean DEFAULT false,
    ai_suggestion_reason text,
    validated_by uuid,
    validated_at timestamp with time zone
);


--
-- Name: messaging_webhooks_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messaging_webhooks_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    platform character varying(50) NOT NULL,
    enabled boolean DEFAULT false,
    webhook_url text,
    phone_number character varying(50),
    api_token text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT messaging_webhooks_config_platform_check CHECK (((platform)::text = ANY ((ARRAY['whatsapp'::character varying, 'telegram'::character varying])::text[])))
);


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    destinataire character varying(255) NOT NULL,
    sujet character varying(255),
    contenu text,
    statut character varying(50) DEFAULT 'envoye'::character varying,
    date_envoi timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    enabled boolean DEFAULT true,
    daily_digest_enabled boolean DEFAULT true,
    daily_digest_time time without time zone DEFAULT '06:00:00'::time without time zone,
    alerte_j15_enabled boolean DEFAULT true,
    alerte_j7_enabled boolean DEFAULT true,
    alerte_j3_enabled boolean DEFAULT true,
    alerte_j1_enabled boolean DEFAULT true,
    alerte_actions_urgentes boolean DEFAULT true,
    alerte_actions_priorite_haute boolean DEFAULT true,
    alerte_audiences_semaine boolean DEFAULT true,
    alerte_audiences_veille boolean DEFAULT true,
    alerte_factures_impayees boolean DEFAULT true,
    alerte_factures_impayees_delai_jours integer DEFAULT 30,
    alerte_delais_appel boolean DEFAULT true,
    alerte_delais_cassation boolean DEFAULT true,
    alerte_delais_opposition boolean DEFAULT true,
    email_format text DEFAULT 'html'::text,
    langue_email text DEFAULT 'fr'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: pending_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    nom_fichier character varying(255) NOT NULL,
    chemin_fichier text NOT NULL,
    source character varying(50),
    statut character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: platform_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    category character varying(50) DEFAULT 'general'::character varying,
    is_secret boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    nom_cabinet character varying(255),
    adresse text,
    telephone character varying(50),
    email character varying(255),
    site_web character varying(255),
    numero_onat character varying(50),
    rib character varying(50),
    logo_url text,
    notification_preferences jsonb DEFAULT '{"frequency": "daily", "email_enabled": true}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: security_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.security_stats AS
 SELECT date(user_activity_logs.created_at) AS date,
    count(*) FILTER (WHERE ((user_activity_logs.action)::text = 'login'::text)) AS connexions,
    count(*) FILTER (WHERE ((user_activity_logs.action)::text = 'login_failed'::text)) AS echecs_connexion,
    count(*) FILTER (WHERE ((user_activity_logs.action)::text ~~ '%_view'::text)) AS consultations,
    count(*) FILTER (WHERE ((user_activity_logs.action)::text ~~ '%_create'::text)) AS creations,
    count(*) FILTER (WHERE ((user_activity_logs.action)::text ~~ '%_update'::text)) AS modifications,
    count(*) FILTER (WHERE ((user_activity_logs.action)::text ~~ '%_delete'::text)) AS suppressions,
    count(*) FILTER (WHERE ((user_activity_logs.action)::text ~~ 'export_%'::text)) AS exports
   FROM public.user_activity_logs
  WHERE (user_activity_logs.created_at >= (now() - '30 days'::interval))
  GROUP BY (date(user_activity_logs.created_at))
  ORDER BY (date(user_activity_logs.created_at)) DESC;


--
-- Name: source_classification_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_classification_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_source_id uuid,
    name text NOT NULL,
    description text,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_category text,
    target_domain text,
    target_document_type text,
    priority integer DEFAULT 0,
    confidence_boost double precision DEFAULT 0.2,
    is_active boolean DEFAULT true,
    times_matched integer DEFAULT 0,
    times_correct integer DEFAULT 0,
    last_matched_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(50) NOT NULL,
    action character varying(100) NOT NULL,
    statut character varying(50) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: taxonomy_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    type text,
    suggested_code text,
    suggested_label_fr text,
    suggested_label_ar text,
    reason text,
    sample_urls text[] DEFAULT '{}'::text[],
    occurrence_count integer DEFAULT 1,
    reviewed_by uuid,
    reviewed_at timestamp with time zone
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    titre character varying(255) NOT NULL,
    description text,
    type_document character varying(100),
    contenu text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    est_public boolean DEFAULT false,
    nombre_utilisations integer DEFAULT 0,
    langue text DEFAULT 'fr'::text,
    CONSTRAINT templates_type_document_check CHECK (((type_document)::text = ANY ((ARRAY['assignation'::character varying, 'requete'::character varying, 'conclusions_demandeur'::character varying, 'conclusions_defenseur'::character varying, 'constitution_avocat'::character varying, 'mise_en_demeure'::character varying, 'appel'::character varying, 'refere'::character varying, 'procuration'::character varying, 'autre'::character varying])::text[])))
);


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    dossier_id uuid,
    description text NOT NULL,
    date date NOT NULL,
    duree_minutes integer NOT NULL,
    taux_horaire numeric(10,2),
    montant numeric(10,2),
    facturable boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: web_crawl_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_crawl_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_source_id uuid NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'pending'::text,
    priority integer DEFAULT 5,
    params jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    worker_id text,
    pages_processed integer DEFAULT 0,
    pages_new integer DEFAULT 0,
    pages_changed integer DEFAULT 0,
    pages_failed integer DEFAULT 0,
    files_downloaded integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT web_crawl_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['full_crawl'::text, 'incremental'::text, 'single_page'::text, 'reindex'::text]))),
    CONSTRAINT web_crawl_jobs_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT web_crawl_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: web_crawl_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_crawl_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_source_id uuid NOT NULL,
    job_id uuid,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    duration_ms integer,
    pages_crawled integer DEFAULT 0,
    pages_new integer DEFAULT 0,
    pages_changed integer DEFAULT 0,
    pages_unchanged integer DEFAULT 0,
    pages_failed integer DEFAULT 0,
    pages_skipped integer DEFAULT 0,
    files_downloaded integer DEFAULT 0,
    bytes_downloaded bigint DEFAULT 0,
    chunks_created integer DEFAULT 0,
    embeddings_generated integer DEFAULT 0,
    status text DEFAULT 'running'::text,
    error_message text,
    errors jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT web_crawl_logs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: web_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_page_id uuid NOT NULL,
    web_source_id uuid NOT NULL,
    knowledge_base_id uuid,
    url text NOT NULL,
    filename text NOT NULL,
    file_type text NOT NULL,
    minio_path text,
    file_size bigint DEFAULT 0,
    content_hash text,
    text_content text,
    word_count integer DEFAULT 0,
    chunks_count integer DEFAULT 0,
    extracted_title text,
    extracted_author text,
    extracted_date timestamp with time zone,
    page_count integer,
    is_downloaded boolean DEFAULT false,
    is_indexed boolean DEFAULT false,
    download_error text,
    parse_error text,
    downloaded_at timestamp with time zone,
    indexed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: web_page_structured_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_page_structured_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_page_id uuid NOT NULL,
    document_type character varying(100),
    document_date date,
    document_number character varying(200),
    title_official text,
    language character varying(5),
    tribunal character varying(200),
    chambre character varying(200),
    decision_number character varying(200),
    decision_date date,
    parties jsonb,
    text_type character varying(100),
    text_number character varying(200),
    publication_date date,
    effective_date date,
    jort_reference character varying(200),
    author text,
    publication_name text,
    keywords jsonb DEFAULT '[]'::jsonb,
    abstract text,
    extraction_confidence double precision,
    llm_provider text,
    llm_model text,
    extracted_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT web_page_structured_metadata_extraction_confidence_check CHECK (((extraction_confidence >= (0)::double precision) AND (extraction_confidence <= (1)::double precision)))
);


--
-- Name: web_page_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_page_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_page_id uuid NOT NULL,
    version integer NOT NULL,
    title text,
    extracted_text text,
    content_hash character varying(64),
    word_count integer,
    metadata jsonb,
    change_type character varying(30) DEFAULT 'initial_crawl'::character varying NOT NULL,
    diff_summary text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT web_page_versions_change_type_check CHECK (((change_type)::text = ANY ((ARRAY['initial_crawl'::character varying, 'content_change'::character varying, 'metadata_change'::character varying, 'restore'::character varying])::text[])))
);


--
-- Name: web_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_source_id uuid NOT NULL,
    url text NOT NULL,
    url_hash text NOT NULL,
    canonical_url text,
    title text,
    content_hash text,
    extracted_text text,
    word_count integer DEFAULT 0,
    language_detected text,
    meta_description text,
    meta_author text,
    meta_date timestamp with time zone,
    meta_keywords text[],
    structured_data jsonb,
    linked_files jsonb DEFAULT '[]'::jsonb,
    etag text,
    last_modified timestamp with time zone,
    status text DEFAULT 'pending'::text,
    error_message text,
    error_count integer DEFAULT 0,
    knowledge_base_id uuid,
    is_indexed boolean DEFAULT false,
    chunks_count integer DEFAULT 0,
    crawl_depth integer DEFAULT 0,
    first_seen_at timestamp with time zone DEFAULT now(),
    last_crawled_at timestamp with time zone,
    last_changed_at timestamp with time zone,
    last_indexed_at timestamp with time zone,
    freshness_score double precision DEFAULT 1.0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    quality_score integer,
    relevance_score double precision,
    legal_domain text,
    requires_human_review boolean DEFAULT false,
    processing_status text DEFAULT 'pending'::text,
    site_structure jsonb,
    CONSTRAINT web_pages_freshness_score_check CHECK (((freshness_score >= (0)::double precision) AND (freshness_score <= (1)::double precision))),
    CONSTRAINT web_pages_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'analyzed'::text, 'classified'::text, 'validated'::text, 'rejected'::text]))),
    CONSTRAINT web_pages_quality_score_check CHECK (((quality_score >= 0) AND (quality_score <= 100))),
    CONSTRAINT web_pages_relevance_score_check CHECK (((relevance_score >= (0)::double precision) AND (relevance_score <= (1)::double precision))),
    CONSTRAINT web_pages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'crawled'::text, 'indexed'::text, 'failed'::text, 'unchanged'::text, 'removed'::text, 'blocked'::text])))
);


--
-- Name: web_scheduler_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_scheduler_config (
    id integer DEFAULT 1 NOT NULL,
    is_enabled boolean DEFAULT true,
    max_concurrent_crawls integer DEFAULT 2,
    max_crawls_per_hour integer DEFAULT 10,
    default_frequency interval DEFAULT '24:00:00'::interval,
    schedule_start_hour integer DEFAULT 0,
    schedule_end_hour integer DEFAULT 23,
    last_run_at timestamp with time zone,
    last_run_result jsonb,
    total_runs integer DEFAULT 0,
    total_errors integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT web_scheduler_config_id_check CHECK ((id = 1)),
    CONSTRAINT web_scheduler_config_schedule_end_hour_check CHECK (((schedule_end_hour >= 0) AND (schedule_end_hour <= 23))),
    CONSTRAINT web_scheduler_config_schedule_start_hour_check CHECK (((schedule_start_hour >= 0) AND (schedule_start_hour <= 23)))
);


--
-- Name: web_source_ban_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_source_ban_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    web_source_id uuid NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    banned_at timestamp with time zone,
    retry_after timestamp with time zone,
    reason text,
    detection_confidence text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT web_source_ban_status_detection_confidence_check CHECK ((detection_confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: web_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    description text,
    favicon_url text,
    category text NOT NULL,
    language text DEFAULT 'fr'::text,
    priority integer DEFAULT 5,
    crawl_frequency interval DEFAULT '24:00:00'::interval NOT NULL,
    adaptive_frequency boolean DEFAULT true,
    css_selectors jsonb DEFAULT '{}'::jsonb,
    url_patterns text[] DEFAULT '{}'::text[],
    excluded_patterns text[] DEFAULT '{}'::text[],
    max_depth integer DEFAULT 3,
    max_pages integer DEFAULT 200,
    follow_links boolean DEFAULT true,
    download_files boolean DEFAULT true,
    requires_javascript boolean DEFAULT false,
    user_agent text DEFAULT 'QadhyaBot/1.0 (+https://qadhya.tn/bot)'::text,
    rate_limit_ms integer DEFAULT 1000,
    timeout_ms integer DEFAULT 30000,
    respect_robots_txt boolean DEFAULT true,
    custom_headers jsonb DEFAULT '{}'::jsonb,
    sitemap_url text,
    rss_feed_url text,
    use_sitemap boolean DEFAULT false,
    is_active boolean DEFAULT true,
    health_status text DEFAULT 'unknown'::text,
    consecutive_failures integer DEFAULT 0,
    last_crawl_at timestamp with time zone,
    last_successful_crawl_at timestamp with time zone,
    next_crawl_at timestamp with time zone,
    total_pages_discovered integer DEFAULT 0,
    total_pages_indexed integer DEFAULT 0,
    avg_pages_per_crawl double precision DEFAULT 0,
    avg_crawl_duration_ms integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    auto_index boolean DEFAULT true,
    stealth_mode boolean DEFAULT false,
    max_pages_per_hour integer,
    max_pages_per_day integer,
    seed_urls text[] DEFAULT '{}'::text[],
    form_crawl_config jsonb,
    ignore_ssl_errors boolean DEFAULT false,
    dynamic_config jsonb,
    extraction_config jsonb,
    auto_crawl_enabled boolean DEFAULT true,
    last_scheduler_error text,
    scheduler_skip_until timestamp with time zone,
    auto_index_files boolean DEFAULT false,
    CONSTRAINT web_sources_category_check CHECK ((category = ANY (ARRAY['legislation'::text, 'jurisprudence'::text, 'doctrine'::text, 'jort'::text, 'modeles'::text, 'procedures'::text, 'formulaires'::text, 'autre'::text]))),
    CONSTRAINT web_sources_health_status_check CHECK ((health_status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'failing'::text, 'unknown'::text]))),
    CONSTRAINT web_sources_language_check CHECK ((language = ANY (ARRAY['ar'::text, 'fr'::text, 'mixed'::text]))),
    CONSTRAINT web_sources_max_depth_check CHECK (((max_depth >= 1) AND (max_depth <= 10))),
    CONSTRAINT web_sources_max_pages_check CHECK (((max_pages >= 1) AND (max_pages <= 10000))),
    CONSTRAINT web_sources_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT web_sources_rate_limit_ms_check CHECK (((rate_limit_ms >= 100) AND (rate_limit_ms <= 60000))),
    CONSTRAINT web_sources_timeout_ms_check CHECK (((timeout_ms >= 5000) AND (timeout_ms <= 120000)))
);


--
-- Name: _migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations ALTER COLUMN id SET DEFAULT nextval('public._migrations_id_seq'::regclass);


--
-- Name: _migrations _migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_name_key UNIQUE (name);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (id);


--
-- Name: actions actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: classification_corrections classification_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_corrections
    ADD CONSTRAINT classification_corrections_pkey PRIMARY KEY (id);


--
-- Name: classification_learning_log classification_learning_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_learning_log
    ADD CONSTRAINT classification_learning_log_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: cloud_providers_config cloud_providers_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_providers_config
    ADD CONSTRAINT cloud_providers_config_pkey PRIMARY KEY (id);


--
-- Name: cloud_providers_config cloud_providers_config_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_providers_config
    ADD CONSTRAINT cloud_providers_config_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: content_contradictions content_contradictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_contradictions
    ADD CONSTRAINT content_contradictions_pkey PRIMARY KEY (id);


--
-- Name: content_quality_assessments content_quality_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_quality_assessments
    ADD CONSTRAINT content_quality_assessments_pkey PRIMARY KEY (id);


--
-- Name: crawler_health_metrics crawler_health_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawler_health_metrics
    ADD CONSTRAINT crawler_health_metrics_pkey PRIMARY KEY (id);


--
-- Name: document_embeddings document_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_embeddings
    ADD CONSTRAINT document_embeddings_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: dossiers dossiers_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_numero_key UNIQUE (numero);


--
-- Name: dossiers dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_pkey PRIMARY KEY (id);


--
-- Name: echeances echeances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.echeances
    ADD CONSTRAINT echeances_pkey PRIMARY KEY (id);


--
-- Name: factures factures_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factures
    ADD CONSTRAINT factures_numero_key UNIQUE (numero);


--
-- Name: factures factures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factures
    ADD CONSTRAINT factures_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_user_id_key UNIQUE (user_id);


--
-- Name: flouci_transactions flouci_transactions_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flouci_transactions
    ADD CONSTRAINT flouci_transactions_payment_id_key UNIQUE (payment_id);


--
-- Name: flouci_transactions flouci_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flouci_transactions
    ADD CONSTRAINT flouci_transactions_pkey PRIMARY KEY (id);


--
-- Name: human_review_queue human_review_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.human_review_queue
    ADD CONSTRAINT human_review_queue_pkey PRIMARY KEY (id);


--
-- Name: indexing_jobs indexing_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indexing_jobs
    ADD CONSTRAINT indexing_jobs_pkey PRIMARY KEY (id);


--
-- Name: jurisprudence jurisprudence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisprudence
    ADD CONSTRAINT jurisprudence_pkey PRIMARY KEY (id);


--
-- Name: jurisprudence_stats jurisprudence_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisprudence_stats
    ADD CONSTRAINT jurisprudence_stats_pkey PRIMARY KEY (id);


--
-- Name: kb_bulk_imports kb_bulk_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_bulk_imports
    ADD CONSTRAINT kb_bulk_imports_pkey PRIMARY KEY (id);


--
-- Name: kb_document_relations kb_document_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_document_relations
    ADD CONSTRAINT kb_document_relations_pkey PRIMARY KEY (id);


--
-- Name: kb_document_relations kb_document_relations_source_document_id_target_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_document_relations
    ADD CONSTRAINT kb_document_relations_source_document_id_target_document_id_key UNIQUE (source_document_id, target_document_id, relation_type);


--
-- Name: knowledge_base_chunks knowledge_base_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_chunks
    ADD CONSTRAINT knowledge_base_chunks_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base
    ADD CONSTRAINT knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_versions knowledge_base_versions_knowledge_base_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_versions
    ADD CONSTRAINT knowledge_base_versions_knowledge_base_id_version_key UNIQUE (knowledge_base_id, version);


--
-- Name: knowledge_base_versions knowledge_base_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_versions
    ADD CONSTRAINT knowledge_base_versions_pkey PRIMARY KEY (id);


--
-- Name: knowledge_categories knowledge_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_pkey PRIMARY KEY (id);


--
-- Name: legal_classifications legal_classifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_classifications
    ADD CONSTRAINT legal_classifications_pkey PRIMARY KEY (id);


--
-- Name: legal_taxonomy legal_taxonomy_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_taxonomy
    ADD CONSTRAINT legal_taxonomy_code_unique UNIQUE (code);


--
-- Name: legal_taxonomy legal_taxonomy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_taxonomy
    ADD CONSTRAINT legal_taxonomy_pkey PRIMARY KEY (id);


--
-- Name: messaging_webhooks_config messaging_webhooks_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messaging_webhooks_config
    ADD CONSTRAINT messaging_webhooks_config_pkey PRIMARY KEY (id);


--
-- Name: messaging_webhooks_config messaging_webhooks_config_user_id_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messaging_webhooks_config
    ADD CONSTRAINT messaging_webhooks_config_user_id_platform_key UNIQUE (user_id, platform);


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: pending_documents pending_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_documents
    ADD CONSTRAINT pending_documents_pkey PRIMARY KEY (id);


--
-- Name: platform_config platform_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_config
    ADD CONSTRAINT platform_config_key_key UNIQUE (key);


--
-- Name: platform_config platform_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_config
    ADD CONSTRAINT platform_config_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: source_classification_rules source_classification_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_classification_rules
    ADD CONSTRAINT source_classification_rules_pkey PRIMARY KEY (id);


--
-- Name: sync_logs sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_logs
    ADD CONSTRAINT sync_logs_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_suggestions taxonomy_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_suggestions
    ADD CONSTRAINT taxonomy_suggestions_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: legal_classifications unique_legal_classification; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_classifications
    ADD CONSTRAINT unique_legal_classification UNIQUE (web_page_id);


--
-- Name: crawler_health_metrics unique_metrics_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawler_health_metrics
    ADD CONSTRAINT unique_metrics_period UNIQUE (web_source_id, period_start, period_end);


--
-- Name: web_files unique_page_file_url; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_files
    ADD CONSTRAINT unique_page_file_url UNIQUE (web_page_id, url);


--
-- Name: content_quality_assessments unique_quality_assessment; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_quality_assessments
    ADD CONSTRAINT unique_quality_assessment UNIQUE (web_page_id);


--
-- Name: web_source_ban_status unique_source_ban_status; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_source_ban_status
    ADD CONSTRAINT unique_source_ban_status UNIQUE (web_source_id);


--
-- Name: web_pages unique_source_url; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_pages
    ADD CONSTRAINT unique_source_url UNIQUE (web_source_id, url_hash);


--
-- Name: user_activity_logs user_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: web_crawl_jobs web_crawl_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_crawl_jobs
    ADD CONSTRAINT web_crawl_jobs_pkey PRIMARY KEY (id);


--
-- Name: web_crawl_logs web_crawl_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_crawl_logs
    ADD CONSTRAINT web_crawl_logs_pkey PRIMARY KEY (id);


--
-- Name: web_files web_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_files
    ADD CONSTRAINT web_files_pkey PRIMARY KEY (id);


--
-- Name: web_page_structured_metadata web_page_structured_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_page_structured_metadata
    ADD CONSTRAINT web_page_structured_metadata_pkey PRIMARY KEY (id);


--
-- Name: web_page_structured_metadata web_page_structured_metadata_web_page_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_page_structured_metadata
    ADD CONSTRAINT web_page_structured_metadata_web_page_id_key UNIQUE (web_page_id);


--
-- Name: web_page_versions web_page_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_page_versions
    ADD CONSTRAINT web_page_versions_pkey PRIMARY KEY (id);


--
-- Name: web_page_versions web_page_versions_web_page_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_page_versions
    ADD CONSTRAINT web_page_versions_web_page_id_version_key UNIQUE (web_page_id, version);


--
-- Name: web_pages web_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_pages
    ADD CONSTRAINT web_pages_pkey PRIMARY KEY (id);


--
-- Name: web_scheduler_config web_scheduler_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_scheduler_config
    ADD CONSTRAINT web_scheduler_config_pkey PRIMARY KEY (id);


--
-- Name: web_source_ban_status web_source_ban_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_source_ban_status
    ADD CONSTRAINT web_source_ban_status_pkey PRIMARY KEY (id);


--
-- Name: web_sources web_sources_base_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_sources
    ADD CONSTRAINT web_sources_base_url_key UNIQUE (base_url);


--
-- Name: web_sources web_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_sources
    ADD CONSTRAINT web_sources_pkey PRIMARY KEY (id);


--
-- Name: idx_actions_dossier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actions_dossier_id ON public.actions USING btree (dossier_id);


--
-- Name: idx_actions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actions_user_id ON public.actions USING btree (user_id);


--
-- Name: idx_admin_notif_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notif_created ON public.admin_notifications USING btree (created_at DESC);


--
-- Name: idx_admin_notif_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notif_is_read ON public.admin_notifications USING btree (is_read);


--
-- Name: idx_admin_notif_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notif_priority ON public.admin_notifications USING btree (priority);


--
-- Name: idx_admin_notif_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notif_target ON public.admin_notifications USING btree (target_type, target_id);


--
-- Name: idx_admin_notif_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notif_type ON public.admin_notifications USING btree (notification_type);


--
-- Name: idx_admin_notif_unread_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notif_unread_priority ON public.admin_notifications USING btree (priority, created_at DESC) WHERE (is_read = false);


--
-- Name: idx_ai_usage_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_created ON public.ai_usage_logs USING btree (created_at);


--
-- Name: idx_ai_usage_logs_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_operation ON public.ai_usage_logs USING btree (operation_type);


--
-- Name: idx_ai_usage_logs_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_provider ON public.ai_usage_logs USING btree (provider);


--
-- Name: idx_ai_usage_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_user ON public.ai_usage_logs USING btree (user_id);


--
-- Name: idx_audit_logs_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action_type ON public.admin_audit_logs USING btree (action_type);


--
-- Name: idx_audit_logs_admin_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_admin_date ON public.admin_audit_logs USING btree (admin_id, created_at DESC);


--
-- Name: idx_audit_logs_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_admin_id ON public.admin_audit_logs USING btree (admin_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.admin_audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_target_id ON public.admin_audit_logs USING btree (target_id);


--
-- Name: idx_audit_logs_target_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_target_type ON public.admin_audit_logs USING btree (target_type);


--
-- Name: idx_chat_conversations_dossier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_dossier ON public.chat_conversations USING btree (dossier_id);


--
-- Name: idx_chat_conversations_summary_needed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_summary_needed ON public.chat_conversations USING btree (user_id, id) WHERE (summary IS NULL);


--
-- Name: idx_chat_conversations_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_updated ON public.chat_conversations USING btree (updated_at DESC);


--
-- Name: idx_chat_conversations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_user ON public.chat_conversations USING btree (user_id);


--
-- Name: idx_chat_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id);


--
-- Name: idx_chat_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at);


--
-- Name: idx_clients_fulltext; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_fulltext ON public.clients USING gin (to_tsvector('french'::regconfig, (((COALESCE(nom, ''::character varying))::text || ' '::text) || (COALESCE(prenom, ''::character varying))::text)));


--
-- Name: idx_clients_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_user_id ON public.clients USING btree (user_id);


--
-- Name: idx_contradictions_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contradictions_source ON public.content_contradictions USING btree (source_page_id);


--
-- Name: idx_contradictions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contradictions_status ON public.content_contradictions USING btree (status, severity DESC) WHERE (status = ANY (ARRAY['pending'::text, 'under_review'::text]));


--
-- Name: idx_contradictions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contradictions_target ON public.content_contradictions USING btree (target_page_id) WHERE (target_page_id IS NOT NULL);


--
-- Name: idx_contradictions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contradictions_type ON public.content_contradictions USING btree (contradiction_type);


--
-- Name: idx_corrections_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrections_page ON public.classification_corrections USING btree (web_page_id);


--
-- Name: idx_corrections_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrections_rule ON public.classification_corrections USING btree (generated_rule_id) WHERE (generated_rule_id IS NOT NULL);


--
-- Name: idx_corrections_unused; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrections_unused ON public.classification_corrections USING btree (used_for_learning) WHERE (used_for_learning = false);


--
-- Name: idx_corrections_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrections_user ON public.classification_corrections USING btree (corrected_by, corrected_at DESC);


--
-- Name: idx_crawl_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_jobs_pending ON public.web_crawl_jobs USING btree (priority DESC, created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_crawl_jobs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_jobs_source ON public.web_crawl_jobs USING btree (web_source_id, created_at DESC);


--
-- Name: idx_crawl_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_jobs_status ON public.web_crawl_jobs USING btree (status);


--
-- Name: idx_crawl_logs_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_logs_job ON public.web_crawl_logs USING btree (job_id) WHERE (job_id IS NOT NULL);


--
-- Name: idx_crawl_logs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawl_logs_source ON public.web_crawl_logs USING btree (web_source_id, started_at DESC);


--
-- Name: idx_crawler_health_metrics_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawler_health_metrics_period ON public.crawler_health_metrics USING btree (period_start, period_end);


--
-- Name: idx_crawler_health_metrics_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crawler_health_metrics_source_id ON public.crawler_health_metrics USING btree (web_source_id);


--
-- Name: idx_document_embeddings_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_document ON public.document_embeddings USING btree (document_id);


--
-- Name: idx_document_embeddings_document_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_document_user ON public.document_embeddings USING btree (document_id, user_id);


--
-- Name: idx_document_embeddings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_user ON public.document_embeddings USING btree (user_id);


--
-- Name: idx_document_embeddings_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_embeddings_vector ON public.document_embeddings USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_documents_dossier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_dossier_id ON public.documents USING btree (dossier_id);


--
-- Name: idx_documents_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_user_id ON public.documents USING btree (user_id);


--
-- Name: idx_dossiers_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dossiers_client_id ON public.dossiers USING btree (client_id);


--
-- Name: idx_dossiers_fulltext; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dossiers_fulltext ON public.dossiers USING gin (to_tsvector('french'::regconfig, (((COALESCE(numero, ''::character varying))::text || ' '::text) || COALESCE(objet, ''::text))));


--
-- Name: idx_dossiers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dossiers_user_id ON public.dossiers USING btree (user_id);


--
-- Name: idx_echeances_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_echeances_date ON public.echeances USING btree (date_echeance);


--
-- Name: idx_echeances_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_echeances_user_id ON public.echeances USING btree (user_id);


--
-- Name: idx_factures_fulltext; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factures_fulltext ON public.factures USING gin (to_tsvector('french'::regconfig, (COALESCE(numero, ''::character varying))::text));


--
-- Name: idx_factures_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factures_user_id ON public.factures USING btree (user_id);


--
-- Name: idx_feature_flags_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feature_flags_user ON public.feature_flags USING btree (user_id);


--
-- Name: idx_indexing_jobs_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indexing_jobs_completed ON public.indexing_jobs USING btree (completed_at) WHERE (status = ANY (ARRAY['completed'::text, 'failed'::text]));


--
-- Name: idx_indexing_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indexing_jobs_pending ON public.indexing_jobs USING btree (status, priority DESC, created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_indexing_jobs_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indexing_jobs_target ON public.indexing_jobs USING btree (target_id, job_type) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_jurisprudence_articles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_articles ON public.jurisprudence USING gin (articles_cited);


--
-- Name: idx_jurisprudence_chamber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_chamber ON public.jurisprudence USING btree (chamber);


--
-- Name: idx_jurisprudence_court; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_court ON public.jurisprudence USING btree (court);


--
-- Name: idx_jurisprudence_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_date ON public.jurisprudence USING btree (decision_date);


--
-- Name: idx_jurisprudence_decision_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_decision_number ON public.jurisprudence USING btree (decision_number);


--
-- Name: idx_jurisprudence_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_domain ON public.jurisprudence USING btree (domain);


--
-- Name: idx_jurisprudence_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_embedding ON public.jurisprudence USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_jurisprudence_fulltext; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_fulltext ON public.jurisprudence USING gin (to_tsvector('french'::regconfig, ((COALESCE(summary, ''::text) || ' '::text) || COALESCE(full_text, ''::text))));


--
-- Name: idx_jurisprudence_keywords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisprudence_keywords ON public.jurisprudence USING gin (keywords);


--
-- Name: idx_kb_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_active ON public.knowledge_base USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_kb_bulk_import_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_bulk_import_ref ON public.knowledge_base USING btree (bulk_import_id) WHERE (bulk_import_id IS NOT NULL);


--
-- Name: idx_kb_bulk_imports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_bulk_imports_status ON public.kb_bulk_imports USING btree (status);


--
-- Name: idx_kb_bulk_imports_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_bulk_imports_user ON public.kb_bulk_imports USING btree (uploaded_by);


--
-- Name: idx_kb_category_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_category_subcategory ON public.knowledge_base USING btree (category, subcategory);


--
-- Name: idx_kb_quality_requires_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_quality_requires_review ON public.knowledge_base USING btree (quality_requires_review) WHERE (quality_requires_review = true);


--
-- Name: idx_kb_quality_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_quality_score ON public.knowledge_base USING btree (quality_score) WHERE (quality_score IS NOT NULL);


--
-- Name: idx_kb_relations_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_relations_severity ON public.kb_document_relations USING btree (contradiction_severity) WHERE (contradiction_severity IS NOT NULL);


--
-- Name: idx_kb_relations_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_relations_source ON public.kb_document_relations USING btree (source_document_id);


--
-- Name: idx_kb_relations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_relations_status ON public.kb_document_relations USING btree (status) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_kb_relations_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_relations_target ON public.kb_document_relations USING btree (target_document_id);


--
-- Name: idx_kb_relations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_relations_type ON public.kb_document_relations USING btree (relation_type);


--
-- Name: idx_kb_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_subcategory ON public.knowledge_base USING btree (subcategory);


--
-- Name: idx_kb_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_tags ON public.knowledge_base USING gin (tags);


--
-- Name: idx_kb_versions_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_versions_changed_at ON public.knowledge_base_versions USING btree (changed_at DESC);


--
-- Name: idx_kb_versions_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_versions_changed_by ON public.knowledge_base_versions USING btree (changed_by);


--
-- Name: idx_kb_versions_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_versions_doc ON public.knowledge_base_versions USING btree (knowledge_base_id);


--
-- Name: idx_kb_versions_doc_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_versions_doc_version ON public.knowledge_base_versions USING btree (knowledge_base_id, version DESC);


--
-- Name: idx_knowledge_base_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_category ON public.knowledge_base USING btree (category);


--
-- Name: idx_knowledge_base_chunks_kb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_chunks_kb_id ON public.knowledge_base_chunks USING btree (knowledge_base_id);


--
-- Name: idx_knowledge_base_chunks_kb_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_chunks_kb_index ON public.knowledge_base_chunks USING btree (knowledge_base_id, chunk_index);


--
-- Name: idx_knowledge_base_chunks_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_chunks_vector ON public.knowledge_base_chunks USING hnsw (embedding public.vector_cosine_ops) WHERE (embedding IS NOT NULL);


--
-- Name: idx_knowledge_base_fulltext; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_fulltext ON public.knowledge_base USING gin (to_tsvector('french'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(description, ''::text))));


--
-- Name: idx_knowledge_base_indexed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_indexed ON public.knowledge_base USING btree (is_indexed);


--
-- Name: idx_knowledge_base_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_language ON public.knowledge_base USING btree (language);


--
-- Name: idx_knowledge_base_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_base_vector ON public.knowledge_base USING hnsw (embedding public.vector_cosine_ops) WHERE (embedding IS NOT NULL);


--
-- Name: idx_learning_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_log_date ON public.classification_learning_log USING btree (created_at DESC);


--
-- Name: idx_learning_log_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_log_rule ON public.classification_learning_log USING btree (rule_id);


--
-- Name: idx_legal_classifications_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_classifications_category ON public.legal_classifications USING btree (primary_category, document_nature);


--
-- Name: idx_legal_classifications_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_classifications_confidence ON public.legal_classifications USING btree (confidence_score);


--
-- Name: idx_legal_classifications_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_classifications_domain ON public.legal_classifications USING btree (domain, subdomain);


--
-- Name: idx_legal_classifications_requires_validation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_classifications_requires_validation ON public.legal_classifications USING btree (classified_at DESC) WHERE (requires_validation = true);


--
-- Name: idx_legal_classifications_signals; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_classifications_signals ON public.legal_classifications USING gin (signals_used);


--
-- Name: idx_legal_classifications_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_classifications_source ON public.legal_classifications USING btree (classification_source);


--
-- Name: idx_notification_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_preferences_user_id ON public.notification_preferences USING btree (user_id);


--
-- Name: idx_platform_config_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_config_category ON public.platform_config USING btree (category);


--
-- Name: idx_platform_config_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_config_key ON public.platform_config USING btree (key);


--
-- Name: idx_quality_assessments_requires_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quality_assessments_requires_review ON public.content_quality_assessments USING btree (assessed_at DESC) WHERE (requires_review = true);


--
-- Name: idx_quality_assessments_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quality_assessments_score ON public.content_quality_assessments USING btree (overall_score DESC);


--
-- Name: idx_review_queue_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_queue_assigned ON public.human_review_queue USING btree (assigned_to, status) WHERE (assigned_to IS NOT NULL);


--
-- Name: idx_review_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_queue_pending ON public.human_review_queue USING btree (priority DESC, created_at) WHERE (status = 'pending'::text);


--
-- Name: idx_review_queue_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_queue_target ON public.human_review_queue USING btree (target_type, target_id);


--
-- Name: idx_review_queue_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_queue_type ON public.human_review_queue USING btree (review_type);


--
-- Name: idx_rules_web_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rules_web_source ON public.source_classification_rules USING btree (web_source_id) WHERE (is_active = true);


--
-- Name: idx_templates_langue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_langue ON public.templates USING btree (langue);


--
-- Name: idx_templates_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_public ON public.templates USING btree (est_public) WHERE (est_public = true);


--
-- Name: idx_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_type ON public.templates USING btree (type_document);


--
-- Name: idx_templates_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_user_id ON public.templates USING btree (user_id);


--
-- Name: idx_time_entries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_user_id ON public.time_entries USING btree (user_id);


--
-- Name: idx_user_activity_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_action ON public.user_activity_logs USING btree (action);


--
-- Name: idx_user_activity_audit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_audit ON public.user_activity_logs USING btree (resource_type, resource_id, created_at DESC);


--
-- Name: idx_user_activity_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_created_at ON public.user_activity_logs USING btree (created_at DESC);


--
-- Name: idx_user_activity_resource_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_resource_id ON public.user_activity_logs USING btree (resource_id);


--
-- Name: idx_user_activity_resource_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_resource_type ON public.user_activity_logs USING btree (resource_type);


--
-- Name: idx_user_activity_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_user_date ON public.user_activity_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_user_activity_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_user_email ON public.user_activity_logs USING btree (user_email);


--
-- Name: idx_user_activity_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_user_id ON public.user_activity_logs USING btree (user_id);


--
-- Name: idx_users_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_approved_by ON public.users USING btree (approved_by);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_last_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_login ON public.users USING btree (last_login_at);


--
-- Name: idx_users_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_plan ON public.users USING btree (plan);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_web_files_kb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_files_kb ON public.web_files USING btree (knowledge_base_id) WHERE (knowledge_base_id IS NOT NULL);


--
-- Name: idx_web_files_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_files_page ON public.web_files USING btree (web_page_id);


--
-- Name: idx_web_files_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_files_pending ON public.web_files USING btree (web_source_id, is_downloaded, is_indexed) WHERE ((is_downloaded = false) OR (is_indexed = false));


--
-- Name: idx_web_files_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_files_source ON public.web_files USING btree (web_source_id);


--
-- Name: idx_web_files_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_files_type ON public.web_files USING btree (file_type);


--
-- Name: idx_web_page_metadata_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_page_metadata_date ON public.web_page_structured_metadata USING btree (document_date) WHERE (document_date IS NOT NULL);


--
-- Name: idx_web_page_metadata_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_page_metadata_page ON public.web_page_structured_metadata USING btree (web_page_id);


--
-- Name: idx_web_page_metadata_tribunal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_page_metadata_tribunal ON public.web_page_structured_metadata USING btree (tribunal) WHERE (tribunal IS NOT NULL);


--
-- Name: idx_web_page_metadata_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_page_metadata_type ON public.web_page_structured_metadata USING btree (document_type) WHERE (document_type IS NOT NULL);


--
-- Name: idx_web_page_versions_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_page_versions_page ON public.web_page_versions USING btree (web_page_id);


--
-- Name: idx_web_page_versions_page_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_page_versions_page_version ON public.web_page_versions USING btree (web_page_id, version DESC);


--
-- Name: idx_web_pages_content_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_content_hash ON public.web_pages USING btree (content_hash);


--
-- Name: idx_web_pages_freshness; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_freshness ON public.web_pages USING btree (freshness_score DESC) WHERE (is_indexed = true);


--
-- Name: idx_web_pages_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_fts ON public.web_pages USING gin (to_tsvector('french'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(extracted_text, ''::text))));


--
-- Name: idx_web_pages_kb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_kb_id ON public.web_pages USING btree (knowledge_base_id) WHERE (knowledge_base_id IS NOT NULL);


--
-- Name: idx_web_pages_processing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_processing_status ON public.web_pages USING btree (processing_status) WHERE (processing_status = ANY (ARRAY['pending'::text, 'analyzed'::text]));


--
-- Name: idx_web_pages_quality_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_quality_score ON public.web_pages USING btree (quality_score DESC) WHERE (quality_score IS NOT NULL);


--
-- Name: idx_web_pages_requires_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_requires_review ON public.web_pages USING btree (created_at DESC) WHERE (requires_human_review = true);


--
-- Name: idx_web_pages_site_structure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_site_structure ON public.web_pages USING gin (site_structure);


--
-- Name: idx_web_pages_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_source ON public.web_pages USING btree (web_source_id, last_crawled_at DESC);


--
-- Name: idx_web_pages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_pages_status ON public.web_pages USING btree (status);


--
-- Name: idx_web_source_ban_status_is_banned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_source_ban_status_is_banned ON public.web_source_ban_status USING btree (is_banned, retry_after);


--
-- Name: idx_web_source_ban_status_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_source_ban_status_source_id ON public.web_source_ban_status USING btree (web_source_id);


--
-- Name: idx_web_sources_auto_crawl; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_sources_auto_crawl ON public.web_sources USING btree (auto_crawl_enabled) WHERE (auto_crawl_enabled = true);


--
-- Name: idx_web_sources_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_sources_category ON public.web_sources USING btree (category);


--
-- Name: idx_web_sources_health; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_sources_health ON public.web_sources USING btree (health_status, is_active);


--
-- Name: idx_web_sources_next_crawl; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_sources_next_crawl ON public.web_sources USING btree (next_crawl_at) WHERE (is_active = true);


--
-- Name: users protect_super_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_super_admin BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.ensure_super_admin();


--
-- Name: users trigger_notify_new_registration; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_new_registration AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.notify_new_registration();


--
-- Name: users trigger_notify_plan_expiring; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_plan_expiring AFTER UPDATE OF plan_expires_at ON public.users FOR EACH ROW EXECUTE FUNCTION public.notify_plan_expiring();


--
-- Name: platform_config trigger_platform_config_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_platform_config_updated BEFORE UPDATE ON public.platform_config FOR EACH ROW EXECUTE FUNCTION public.update_platform_config_timestamp();


--
-- Name: crawler_health_metrics trigger_update_crawler_success_rate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_crawler_success_rate BEFORE INSERT OR UPDATE ON public.crawler_health_metrics FOR EACH ROW EXECUTE FUNCTION public.update_crawler_success_rate();


--
-- Name: jurisprudence trigger_update_jurisprudence_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_jurisprudence_stats AFTER INSERT OR DELETE ON public.jurisprudence FOR EACH STATEMENT EXECUTE FUNCTION public.update_jurisprudence_stats();


--
-- Name: users trigger_user_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_user_status_transition BEFORE UPDATE OF status ON public.users FOR EACH ROW EXECUTE FUNCTION public.validate_user_status_transition();


--
-- Name: actions update_actions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chat_conversations update_chat_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: content_contradictions update_contradictions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contradictions_updated_at BEFORE UPDATE ON public.content_contradictions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: dossiers update_dossiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_dossiers_updated_at BEFORE UPDATE ON public.dossiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: echeances update_echeances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_echeances_updated_at BEFORE UPDATE ON public.echeances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: factures update_factures_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_factures_updated_at BEFORE UPDATE ON public.factures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: feature_flags update_feature_flags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: jurisprudence update_jurisprudence_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_jurisprudence_updated_at BEFORE UPDATE ON public.jurisprudence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: knowledge_base update_knowledge_base_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON public.knowledge_base FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: human_review_queue update_review_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_review_queue_updated_at BEFORE UPDATE ON public.human_review_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: web_pages update_web_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_web_pages_updated_at BEFORE UPDATE ON public.web_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: web_sources update_web_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_web_sources_updated_at BEFORE UPDATE ON public.web_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: actions actions_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: actions actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_audit_logs admin_audit_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_notifications admin_notifications_actioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_actioned_by_fkey FOREIGN KEY (actioned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_notifications admin_notifications_read_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_read_by_fkey FOREIGN KEY (read_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_usage_logs ai_usage_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: classification_corrections classification_corrections_generated_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_corrections
    ADD CONSTRAINT classification_corrections_generated_rule_id_fkey FOREIGN KEY (generated_rule_id) REFERENCES public.source_classification_rules(id) ON DELETE SET NULL;


--
-- Name: classification_corrections classification_corrections_web_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_corrections
    ADD CONSTRAINT classification_corrections_web_page_id_fkey FOREIGN KEY (web_page_id) REFERENCES public.web_pages(id) ON DELETE CASCADE;


--
-- Name: classification_learning_log classification_learning_log_learned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_learning_log
    ADD CONSTRAINT classification_learning_log_learned_by_user_id_fkey FOREIGN KEY (learned_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: classification_learning_log classification_learning_log_learned_from_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_learning_log
    ADD CONSTRAINT classification_learning_log_learned_from_page_id_fkey FOREIGN KEY (learned_from_page_id) REFERENCES public.web_pages(id) ON DELETE SET NULL;


--
-- Name: classification_learning_log classification_learning_log_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_learning_log
    ADD CONSTRAINT classification_learning_log_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.source_classification_rules(id) ON DELETE CASCADE;


--
-- Name: clients clients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cloud_providers_config cloud_providers_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_providers_config
    ADD CONSTRAINT cloud_providers_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: content_contradictions content_contradictions_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_contradictions
    ADD CONSTRAINT content_contradictions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: content_contradictions content_contradictions_source_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_contradictions
    ADD CONSTRAINT content_contradictions_source_page_id_fkey FOREIGN KEY (source_page_id) REFERENCES public.web_pages(id) ON DELETE CASCADE;


--
-- Name: content_contradictions content_contradictions_target_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_contradictions
    ADD CONSTRAINT content_contradictions_target_page_id_fkey FOREIGN KEY (target_page_id) REFERENCES public.web_pages(id) ON DELETE SET NULL;


--
-- Name: content_quality_assessments content_quality_assessments_web_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_quality_assessments
    ADD CONSTRAINT content_quality_assessments_web_page_id_fkey FOREIGN KEY (web_page_id) REFERENCES public.web_pages(id) ON DELETE CASCADE;


--
-- Name: crawler_health_metrics crawler_health_metrics_web_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawler_health_metrics
    ADD CONSTRAINT crawler_health_metrics_web_source_id_fkey FOREIGN KEY (web_source_id) REFERENCES public.web_sources(id) ON DELETE CASCADE;


--
-- Name: document_embeddings document_embeddings_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_embeddings
    ADD CONSTRAINT document_embeddings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_embeddings document_embeddings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_embeddings
    ADD CONSTRAINT document_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: documents documents_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dossiers dossiers_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: dossiers dossiers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: echeances echeances_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.echeances
    ADD CONSTRAINT echeances_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: echeances echeances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.echeances
    ADD CONSTRAINT echeances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: factures factures_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factures
    ADD CONSTRAINT factures_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: factures factures_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factures
    ADD CONSTRAINT factures_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE SET NULL;


--
-- Name: factures factures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factures
    ADD CONSTRAINT factures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feature_flags feature_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: flouci_transactions flouci_transactions_facture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flouci_transactions
    ADD CONSTRAINT flouci_transactions_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES public.factures(id) ON DELETE CASCADE;


--
-- Name: human_review_queue human_review_queue_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.human_review_queue
    ADD CONSTRAINT human_review_queue_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: human_review_queue human_review_queue_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.human_review_queue
    ADD CONSTRAINT human_review_queue_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: kb_bulk_imports kb_bulk_imports_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_bulk_imports
    ADD CONSTRAINT kb_bulk_imports_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: kb_document_relations kb_document_relations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_document_relations
    ADD CONSTRAINT kb_document_relations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: kb_document_relations kb_document_relations_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_document_relations
    ADD CONSTRAINT kb_document_relations_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES public.knowledge_base(id) ON DELETE CASCADE;


--
-- Name: kb_document_relations kb_document_relations_target_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_document_relations
    ADD CONSTRAINT kb_document_relations_target_document_id_fkey FOREIGN KEY (target_document_id) REFERENCES public.knowledge_base(id) ON DELETE CASCADE;


--
-- Name: knowledge_base knowledge_base_bulk_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base
    ADD CONSTRAINT knowledge_base_bulk_import_id_fkey FOREIGN KEY (bulk_import_id) REFERENCES public.kb_bulk_imports(id) ON DELETE SET NULL;


--
-- Name: knowledge_base_chunks knowledge_base_chunks_knowledge_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_chunks
    ADD CONSTRAINT knowledge_base_chunks_knowledge_base_id_fkey FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_base(id) ON DELETE CASCADE;


--
-- Name: knowledge_base knowledge_base_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base
    ADD CONSTRAINT knowledge_base_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: knowledge_base_versions knowledge_base_versions_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_versions
    ADD CONSTRAINT knowledge_base_versions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: knowledge_base_versions knowledge_base_versions_knowledge_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_versions
    ADD CONSTRAINT knowledge_base_versions_knowledge_base_id_fkey FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_base(id) ON DELETE CASCADE;


--
-- Name: knowledge_categories knowledge_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.knowledge_categories(id);


--
-- Name: legal_classifications legal_classifications_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_classifications
    ADD CONSTRAINT legal_classifications_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: legal_classifications legal_classifications_web_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_classifications
    ADD CONSTRAINT legal_classifications_web_page_id_fkey FOREIGN KEY (web_page_id) REFERENCES public.web_pages(id) ON DELETE CASCADE;


--
-- Name: legal_taxonomy legal_taxonomy_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_taxonomy
    ADD CONSTRAINT legal_taxonomy_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.legal_taxonomy(id);


--
-- Name: messaging_webhooks_config messaging_webhooks_config_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messaging_webhooks_config
    ADD CONSTRAINT messaging_webhooks_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_logs notification_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pending_documents pending_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_documents
    ADD CONSTRAINT pending_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: source_classification_rules source_classification_rules_web_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_classification_rules
    ADD CONSTRAINT source_classification_rules_web_source_id_fkey FOREIGN KEY (web_source_id) REFERENCES public.web_sources(id) ON DELETE CASCADE;


--
-- Name: sync_logs sync_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_logs
    ADD CONSTRAINT sync_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: templates templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: time_entries time_entries_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: time_entries time_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_activity_logs user_activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_logs
    ADD CONSTRAINT user_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: web_crawl_jobs web_crawl_jobs_web_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_crawl_jobs
    ADD CONSTRAINT web_crawl_jobs_web_source_id_fkey FOREIGN KEY (web_source_id) REFERENCES public.web_sources(id) ON DELETE CASCADE;


--
-- Name: web_crawl_logs web_crawl_logs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_crawl_logs
    ADD CONSTRAINT web_crawl_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.web_crawl_jobs(id) ON DELETE SET NULL;


--
-- Name: web_crawl_logs web_crawl_logs_web_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_crawl_logs
    ADD CONSTRAINT web_crawl_logs_web_source_id_fkey FOREIGN KEY (web_source_id) REFERENCES public.web_sources(id) ON DELETE CASCADE;


--
-- Name: web_files web_files_knowledge_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_files
    ADD CONSTRAINT web_files_knowledge_base_id_fkey FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_base(id) ON DELETE SET NULL;


--
-- Name: web_files web_files_web_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_files
    ADD CONSTRAINT web_files_web_page_id_fkey FOREIGN KEY (web_page_id) REFERENCES public.web_pages(id) ON DELETE CASCADE;


--
-- Name: web_files web_files_web_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_files
    ADD CONSTRAINT web_files_web_source_id_fkey FOREIGN KEY (web_source_id) REFERENCES public.web_sources(id) ON DELETE CASCADE;


--
-- Name: web_page_structured_metadata web_page_structured_metadata_web_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_page_structured_metadata
    ADD CONSTRAINT web_page_structured_metadata_web_page_id_fkey FOREIGN KEY (web_page_id) REFERENCES public.web_pages(id) ON DELETE CASCADE;


--
-- Name: web_page_versions web_page_versions_web_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_page_versions
    ADD CONSTRAINT web_page_versions_web_page_id_fkey FOREIGN KEY (web_page_id) REFERENCES public.web_pages(id) ON DELETE CASCADE;


--
-- Name: web_pages web_pages_knowledge_base_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_pages
    ADD CONSTRAINT web_pages_knowledge_base_id_fkey FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_base(id) ON DELETE SET NULL;


--
-- Name: web_pages web_pages_web_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_pages
    ADD CONSTRAINT web_pages_web_source_id_fkey FOREIGN KEY (web_source_id) REFERENCES public.web_sources(id) ON DELETE CASCADE;


--
-- Name: web_source_ban_status web_source_ban_status_web_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_source_ban_status
    ADD CONSTRAINT web_source_ban_status_web_source_id_fkey FOREIGN KEY (web_source_id) REFERENCES public.web_sources(id) ON DELETE CASCADE;


--
-- Name: web_sources web_sources_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_sources
    ADD CONSTRAINT web_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict XANOlCiF7Jsm6jwfNi7M8GJp6BtoP4sBKJ6MeyiGHrvG6qPitoufFwv5TawweXI

