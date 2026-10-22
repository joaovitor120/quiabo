"""Busca a cotação do quiabo extra (R$/kg) na CEASA-ES, mercado Grande Vitória,
e grava na tabela `precos` do Supabase.

Tenta os últimos N dias (padrão 7), então recupera sozinho dias perdidos.
Dias sem boletim (fim de semana, feriado) são ignorados.

Variáveis de ambiente:
  SUPABASE_URL               ex.: https://abcd1234.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  chave "service_role" (segredo do repositório)
  DIAS                       opcional, quantos dias para trás tentar (padrão 7)

Uso local sem gravar:  python scripts/atualizar_cotacao.py --so-mostrar
"""

import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from tempfile import mkdtemp

from cotacoes_ceasa.collectors.ceasa_es import CEASA_ES_HEADERS, CeasaEsCollector
from cotacoes_ceasa.http.client import HttpClient
from cotacoes_ceasa.parsers.ceasa_es import CeasaEsParser
from cotacoes_ceasa.storage.raw_html import RawHtmlStorage

BASE_URL = "http://200.198.51.71/detec/filtro_boletim_es/filtro_boletim_es.php"
MERCADO = "ceasa-grande-vitoria"
PRODUTO = "QUIABO EXTRA"


def coletar(dias: int) -> list[dict]:
    coletor = CeasaEsCollector(
        HttpClient(headers=CEASA_ES_HEADERS, request_delay_seconds=1.5),
        RawHtmlStorage(Path(mkdtemp(prefix="ceasa_raw_"))),
        CeasaEsParser(),
        BASE_URL,
    )
    hoje = datetime.now(timezone(timedelta(hours=-3))).date()
    linhas: dict[str, dict] = {}
    erros = 0
    for i in range(dias):
        dia = hoje - timedelta(days=i)
        try:
            cotacoes = coletor.collect_category(MERCADO, dia, save_raw=False)
        except Exception as exc:  # dia sem boletim ou falha da fonte
            erros += 1
            print(f"{dia}: sem boletim ({type(exc).__name__})")
            continue
        for c in cotacoes:
            if (
                c.produto.strip().upper() == PRODUTO
                and (c.unidade or "").strip().upper() == "KG"
                and c.data_cotacao == dia
                and c.preco_comum is not None
            ):
                comum = float(c.preco_comum)
                linhas[dia.isoformat()] = {
                    "data": dia.isoformat(),
                    "min": float(c.preco_minimo) if c.preco_minimo is not None else comum,
                    "comum": comum,
                    "max": float(c.preco_maximo) if c.preco_maximo is not None else comum,
                    "sit": c.situacao_mercado,
                    "atualizado_em": datetime.now(timezone.utc).isoformat(),
                }
                print(f"{dia}: quiabo extra R$ {comum:.2f}/kg")
    if erros == dias:
        raise SystemExit("Nenhum boletim pôde ser lido. O site da CEASA-ES pode estar fora do ar.")
    return sorted(linhas.values(), key=lambda r: r["data"])


def gravar(linhas: list[dict]) -> None:
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/precos?on_conflict=data"
    chave = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        url,
        data=json.dumps(linhas).encode("utf-8"),
        method="POST",
        headers={
            "apikey": chave,
            "Authorization": f"Bearer {chave}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status not in (200, 201, 204):
            raise SystemExit(f"Supabase respondeu {resp.status}")
    print(f"{len(linhas)} cotações gravadas no Supabase.")


def main() -> None:
    dias = int(os.environ.get("DIAS", "7"))
    linhas = coletar(dias)
    if not linhas:
        print("Nenhuma cotação de quiabo nos boletins encontrados.")
        return
    if "--so-mostrar" in sys.argv:
        print(json.dumps(linhas, ensure_ascii=False, indent=2))
        return
    gravar(linhas)


if __name__ == "__main__":
    main()
