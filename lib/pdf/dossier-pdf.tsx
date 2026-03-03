import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'

export interface DossierPDFData {
  dossier: {
    numero: string
    objet: string
    type_procedure?: string
    statut: string
    tribunal?: string
    adverse_partie?: string
    date_ouverture: string
    date_cloture?: string
    notes?: string
    workflow_statut?: string
  }
  client?: {
    nom: string
    prenom?: string
    type_client?: string
    telephone?: string
    email?: string
  }
  avocat: {
    nom: string
    prenom?: string
    email: string
    cabinet_nom?: string
  }
  actions: {
    titre: string
    statut: string
    date_action?: string
    description?: string
  }[]
  echeances: {
    titre: string
    date_echeance: string
    statut?: string
    priorite?: string
  }[]
  documents: {
    nom: string
    type?: string
    created_at: string
  }[]
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1.5 solid #3b82f6',
  },
  headerLeft: {
    flex: 1,
  },
  headerBrand: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#3b82f6',
    marginBottom: 2,
  },
  headerCabinet: {
    fontSize: 9,
    color: '#64748b',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  dossierLabel: {
    fontSize: 8,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dossierNumero: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
    marginTop: 2,
  },
  dossierDate: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 16,
    paddingBottom: 3,
    borderBottom: '0.5 solid #e2e8f0',
  },
  grid2: {
    flexDirection: 'row',
    gap: 12,
  },
  gridItem: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 8,
  },
  fieldLabel: {
    fontSize: 8,
    color: '#94a3b8',
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 9,
    color: '#1e293b',
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: 5,
    borderRadius: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 5,
    borderBottom: '0.5 solid #f1f5f9',
  },
  tableCell: {
    fontSize: 9,
    color: '#374151',
  },
  tableCellMuted: {
    fontSize: 8,
    color: '#94a3b8',
  },
  notesBox: {
    backgroundColor: '#fffbeb',
    borderLeft: '3 solid #f59e0b',
    padding: 8,
    borderRadius: 2,
    marginTop: 6,
  },
  notesText: {
    fontSize: 9,
    color: '#78350f',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '0.5 solid #e2e8f0',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#94a3b8',
  },
})

function statusLabel(statut: string): string {
  const map: Record<string, string> = {
    en_cours: 'En cours',
    clos: 'Clos',
    archive: 'Archivé',
    a_faire: 'À faire',
    en_attente: 'En attente',
    termine: 'Terminé',
    urgent: 'Urgent',
    normal: 'Normal',
    faible: 'Faible',
  }
  return map[statut] || statut
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function DossierPDF({ dossier, client, avocat, actions, echeances, documents }: DossierPDFData) {
  const clientName = client
    ? `${client.nom}${client.prenom ? ' ' + client.prenom : ''}`
    : '—'

  return (
    <Document
      title={`Dossier ${dossier.numero}`}
      author={`${avocat.prenom || ''} ${avocat.nom}`.trim()}
      subject="Résumé de dossier juridique"
      creator="Qadhya"
    >
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerBrand}>Qadhya</Text>
            {avocat.cabinet_nom && (
              <Text style={styles.headerCabinet}>{avocat.cabinet_nom}</Text>
            )}
            <Text style={styles.headerCabinet}>
              {avocat.prenom ? `Me ${avocat.prenom} ${avocat.nom}` : `Me ${avocat.nom}`}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.dossierLabel}>Dossier</Text>
            <Text style={styles.dossierNumero}>{dossier.numero}</Text>
            <Text style={styles.dossierDate}>
              Ouvert le {formatDate(dossier.date_ouverture)}
            </Text>
            <Text style={{ ...styles.dossierDate, color: '#3b82f6', marginTop: 4 }}>
              {statusLabel(dossier.statut)}
            </Text>
          </View>
        </View>

        {/* Objet */}
        <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 12 }}>
          {dossier.objet}
        </Text>

        {/* Informations générales */}
        <Text style={styles.sectionTitle}>Informations générales</Text>
        <View style={styles.grid2}>
          <View style={styles.gridItem}>
            <Text style={styles.fieldLabel}>Client</Text>
            <Text style={styles.fieldValue}>{clientName}</Text>
            {client?.telephone && (
              <Text style={{ ...styles.fieldValue, color: '#64748b', marginTop: 1 }}>
                {client.telephone}
              </Text>
            )}
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.fieldLabel}>Type de procédure</Text>
            <Text style={styles.fieldValue}>{dossier.type_procedure || '—'}</Text>
            <Text style={{ ...styles.fieldLabel, marginTop: 4 }}>Tribunal</Text>
            <Text style={styles.fieldValue}>{dossier.tribunal || '—'}</Text>
          </View>
        </View>

        {dossier.adverse_partie && (
          <View style={{ ...styles.gridItem, marginTop: 6 }}>
            <Text style={styles.fieldLabel}>Partie adverse</Text>
            <Text style={styles.fieldValue}>{dossier.adverse_partie}</Text>
          </View>
        )}

        {/* Notes */}
        {dossier.notes && (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{dossier.notes}</Text>
            </View>
          </>
        )}

        {/* Échéances */}
        {echeances.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Échéances ({echeances.length})
            </Text>
            <View style={styles.tableHeader}>
              <Text style={{ ...styles.tableCellMuted, flex: 3 }}>Titre</Text>
              <Text style={{ ...styles.tableCellMuted, flex: 2 }}>Date</Text>
              <Text style={{ ...styles.tableCellMuted, flex: 1 }}>Priorité</Text>
            </View>
            {echeances.slice(0, 10).map((e, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={{ ...styles.tableCell, flex: 3 }}>{e.titre}</Text>
                <Text style={{ ...styles.tableCell, flex: 2 }}>{formatDate(e.date_echeance)}</Text>
                <Text style={{ ...styles.tableCellMuted, flex: 1 }}>{e.priorite || '—'}</Text>
              </View>
            ))}
            {echeances.length > 10 && (
              <Text style={{ ...styles.tableCellMuted, marginTop: 4, textAlign: 'center' }}>
                ... et {echeances.length - 10} autres échéances
              </Text>
            )}
          </>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Actions ({actions.length})
            </Text>
            <View style={styles.tableHeader}>
              <Text style={{ ...styles.tableCellMuted, flex: 3 }}>Titre</Text>
              <Text style={{ ...styles.tableCellMuted, flex: 2 }}>Date</Text>
              <Text style={{ ...styles.tableCellMuted, flex: 1 }}>Statut</Text>
            </View>
            {actions.slice(0, 10).map((a, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={{ ...styles.tableCell, flex: 3 }}>{a.titre}</Text>
                <Text style={{ ...styles.tableCell, flex: 2 }}>{formatDate(a.date_action)}</Text>
                <Text style={{ ...styles.tableCellMuted, flex: 1 }}>{statusLabel(a.statut)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Documents ({documents.length})
            </Text>
            {documents.slice(0, 8).map((d, i) => (
              <View key={i} style={{ ...styles.tableRow, paddingVertical: 3 }}>
                <Text style={{ ...styles.tableCell, flex: 3 }}>{d.nom}</Text>
                <Text style={{ ...styles.tableCellMuted, flex: 1 }}>{d.type || '—'}</Text>
                <Text style={{ ...styles.tableCellMuted, flex: 1 }}>{formatDate(d.created_at)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Pied de page */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Qadhya — {avocat.cabinet_nom || `Me ${avocat.nom}`}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages} • Généré le ${formatDate(new Date().toISOString())}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
