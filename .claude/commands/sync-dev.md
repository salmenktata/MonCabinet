Synchroniser la KB prod vers local pour le développement.

Exécute le script de synchronisation avec les arguments fournis : $ARGUMENTS

Options disponibles :
- (sans argument) : sync incrémentiel (nouveaux docs seulement)
- `--full` : sync complète (tous les docs)
- `--no-embeddings` : sans les embeddings (plus rapide)

Commande à exécuter :
```bash
bash scripts/sync-prod-kb-to-local.sh $ARGUMENTS
```

Affiche le résultat de la synchronisation et un résumé des documents synchronisés.
