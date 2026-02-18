#!/usr/bin/env python3
"""
Benchmark TTFT (Time To First Token) — Qadhya RAG Pipeline
Usage: python3 scripts/benchmark-ttft.py
Pré-requis: VPS_HOST, VPS_PASSWORD, VPS_USER dans l'environnement
"""

import subprocess, hmac, hashlib, base64, json, time, sys
import urllib.request, urllib.error

VPS_HOST = "84.247.165.187"
VPS_USER = "root"
VPS_PASSWORD = "IeRfA8Z46gsYSNh7"
BASE = "https://qadhya.tn"
BASELINE_TTFT = 46.35  # mesuré avant Fix A+B+C

def get_jwt_token():
    result = subprocess.run([
        "sshpass", "-p", VPS_PASSWORD,
        "ssh", "-o", "StrictHostKeyChecking=no", "-T", f"{VPS_USER}@{VPS_HOST}",
        "docker exec qadhya-nextjs env 2>/dev/null | grep NEXTAUTH_SECRET | cut -d= -f2-"
    ], capture_output=True, text=True, timeout=30)
    secret = result.stdout.strip()
    if not secret:
        print("❌ Impossible de récupérer NEXTAUTH_SECRET")
        sys.exit(1)

    result2 = subprocess.run([
        "sshpass", "-p", VPS_PASSWORD,
        "ssh", "-o", "StrictHostKeyChecking=no", "-T", f"{VPS_USER}@{VPS_HOST}",
        "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -c "
        "\"SELECT id, email, nom, prenom, role, status, plan FROM users WHERE email='salmen.ktata@gmail.com' LIMIT 1;\""
    ], capture_output=True, text=True, timeout=30)
    row = [x.strip() for x in result2.stdout.strip().split("|")]
    user_id, email, nom, prenom, role, status, plan = row[0], row[1], row[2], row[3], row[4], row[5], row[6]
    name = f"{prenom} {nom}" if prenom and nom else email
    user_obj = {"id": user_id, "email": email, "name": name, "role": role,
                 "status": status or "approved", "plan": plan or "free"}
    now = int(time.time())

    def b64url(data):
        if isinstance(data, str): data = data.encode()
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

    header = b64url(json.dumps({"alg": "HS256"}, separators=(',', ':')))
    payload = b64url(json.dumps({"user": user_obj, "iat": now, "exp": now + 86400, "sub": user_id}, separators=(',', ':')))
    msg = f"{header}.{payload}".encode()
    sig = hmac.new(secret.encode(), msg, hashlib.sha256).digest()
    return f"{header}.{payload}.{b64url(sig)}"


def check_preconditions(token):
    print("=== Vérifications pré-benchmark ===")

    # 1. Vérifier charge VPS
    result = subprocess.run([
        "sshpass", "-p", VPS_PASSWORD,
        "ssh", "-o", "StrictHostKeyChecking=no", "-T", f"{VPS_USER}@{VPS_HOST}",
        "docker stats --no-stream --format '{{.Name}}: CPU={{.CPUPerc}} MEM={{.MemUsage}}' 2>/dev/null | grep nextjs"
    ], capture_output=True, text=True, timeout=20)
    print(f"VPS: {result.stdout.strip()}")

    # 2. Vérifier OCR en cours
    result2 = subprocess.run([
        "sshpass", "-p", VPS_PASSWORD,
        "ssh", "-o", "StrictHostKeyChecking=no", "-T", f"{VPS_USER}@{VPS_HOST}",
        "docker top qadhya-nextjs 2>/dev/null | grep -c tesseract || echo 0"
    ], capture_output=True, text=True, timeout=20)
    ocr_count = result2.stdout.strip()
    print(f"OCR Tesseract actifs: {ocr_count}")
    if int(ocr_count or 0) > 0:
        print("⚠️  OCR en cours — mesure peut être faussée")

    # 3. Tester Groq (rapide)
    print("Groq quota: test en cours...")
    data = json.dumps({"question": "test", "stream": False, "actionType": "chat"}).encode()
    req = urllib.request.Request(BASE + "/api/chat", data=data,
        headers={"Content-Type": "application/json", "Cookie": f"auth_session={token}"})
    try:
        t0 = time.time()
        resp = urllib.request.urlopen(req, timeout=15)
        result_data = json.loads(resp.read())
        elapsed = time.time() - t0
        model = result_data.get("model", "?")
        print(f"✓ Chat OK ({elapsed:.1f}s) — modèle: {model}")
    except Exception as e:
        print(f"⚠️  Chat test: {e}")

    print()


def measure_ttft(token, question, label):
    data = json.dumps({"question": question, "stream": True,
                        "includeJurisprudence": True, "actionType": "chat"}).encode()
    req = urllib.request.Request(BASE + "/api/chat", data=data,
        headers={"Content-Type": "application/json", "Cookie": f"auth_session={token}"})
    t0 = time.time()
    t_meta, t_first = None, None
    chars, chunks, sources = 0, 0, 0
    error_msg = None
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        buf = b""
        while True:
            raw = resp.read(1024)
            if not raw: break
            buf += raw
            parts = buf.split(b"\n\n")
            buf = parts.pop()
            for part in parts:
                if not part.startswith(b"data: "): continue
                try:
                    d = json.loads(part[6:])
                    t = d.get("type")
                    if t == "metadata":
                        t_meta = time.time() - t0
                        sources = len(d.get("sources", []))
                        print(f"  metadata à {t_meta:.2f}s ({sources} sources)")
                    elif t == "content":
                        if t_first is None:
                            t_first = time.time() - t0
                            print(f"  >>> PREMIER TOKEN à {t_first:.2f}s <<<")
                        chars += len(d.get("content", ""))
                        chunks += 1
                    elif t == "done":
                        break
                    elif t == "error":
                        error_msg = d.get("error", "")[:100]
                        print(f"  ❌ Erreur LLM: {error_msg}")
                        break
                except: pass
    except Exception as e:
        error_msg = str(e)
        print(f"  ❌ Erreur réseau: {error_msg[:80]}")

    total = time.time() - t0
    ttft = t_first or t_meta  # TTFT réel = premier content token
    valid = t_first is not None  # valide seulement si content reçu
    status = "✓" if t_first else ("⚠ meta-only" if t_meta else "✗")
    print(f"  {status} TTFT={ttft:.2f}s | Total={total:.2f}s | {chunks} chunks | {chars} chars | {sources} sources")
    return {"label": label, "ttft": ttft, "t_meta": t_meta, "t_first": t_first,
            "total": total, "chars": chars, "chunks": chunks, "sources": sources,
            "valid": valid, "error": error_msg}


def main():
    print(f"{'='*60}")
    print("BENCHMARK TTFT — Qadhya RAG Pipeline")
    print(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S CET')}")
    print(f"{'='*60}\n")

    print("Génération token JWT...")
    token = get_jwt_token()
    print(f"✓ Token généré\n")

    check_preconditions(token)

    QUESTIONS = [
        ("ما هي حقوق المستأجر في القانون التونسي؟",   "arabe moyen (location)"),
        ("إجراءات التقاضي أمام المحكمة الابتدائية",   "arabe moyen (procédure)"),
        ("عقد الشغل وشروط الفسخ",                     "arabe court (travail)"),
        ("ما هي شروط صحة عقد البيع؟",                 "arabe moyen (contrat)"),
    ]

    results = []
    for i, (question, label) in enumerate(QUESTIONS, 1):
        print(f"[{i}/{len(QUESTIONS)}] {label}")
        print(f"  Q: {question}")
        r = measure_ttft(token, question, label)
        results.append(r)
        if i < len(QUESTIONS):
            print("  (pause 3s...)")
            time.sleep(3)

    # Résumé
    print(f"\n{'='*60}")
    print("RÉSULTATS FINAUX")
    print(f"{'='*60}")
    valid = [r for r in results if r.get("valid")]
    all_ttft = [r for r in results if r.get("ttft")]

    if valid:
        avg_ttft = sum(r["ttft"] for r in valid) / len(valid)
        avg_total = sum(r["total"] for r in valid) / len(valid)
        avg_sources = sum(r.get("sources", 0) for r in valid) / len(valid)
        gain = BASELINE_TTFT - avg_ttft
        pct = gain / BASELINE_TTFT * 100
        print(f"Baseline (avant Fix A+B+C) : {BASELINE_TTFT}s")
        print(f"Moyenne TTFT (mesurée)     : {avg_ttft:.2f}s  [{len(valid)}/{len(results)} valides]")
        print(f"Gain mesuré                : {gain:+.1f}s  ({pct:+.0f}%)")
        print(f"Moyenne Total              : {avg_total:.2f}s")
        print(f"Moyenne sources RAG        : {avg_sources:.1f}")
        print()
        for r in results:
            tok = "✓" if r.get("valid") else ("⚠" if r.get("t_meta") else "✗")
            print(f"  {tok} [{r['label']}]")
            print(f"    TTFT={r.get('ttft') or 'N/A':.2f}s | RAG={r.get('t_meta') or 0:.2f}s | {r.get('sources',0)} sources")
    else:
        print("❌ Aucun résultat valide avec content streaming")
        print("   (Groq peut-être encore rate-limited, ou VPS surchargé)")
        if all_ttft:
            print(f"   Temps metadata disponibles: {[f'{r[\"ttft\"]:.2f}s' for r in all_ttft]}")


if __name__ == "__main__":
    main()
