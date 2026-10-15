"""Generate docs/17-data-dictionary.md from prisma/schema.prisma (run: python3 scripts/gen-data-dictionary.py).

The dictionary is generated so it can never drift from the real database: every table, column, type,
enum and foreign key below comes straight from the schema, including the comments written there.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = '\n'.join(p.read_text() for p in sorted((ROOT / 'prisma/schema').glob('*.prisma')))
lines = src.splitlines()

enums = {}
for m in re.finditer(r'^enum (\w+) \{(.*?)^\}', src, re.M | re.S):
    enums[m.group(1)] = [l.strip().split()[0] for l in m.group(2).splitlines() if l.strip() and not l.strip().startswith('//')]

models = []
i = 0
while i < len(lines):
    m = re.match(r'^model (\w+) \{', lines[i])
    if not m:
        i += 1
        continue
    name = m.group(1)
    doc, j = [], i - 1
    while j >= 0 and lines[j].strip().startswith('//'):
        t = lines[j].strip().lstrip('/').strip()
        if not t.startswith('----------'):
            doc.insert(0, t)
        j -= 1
    fields, table = [], None
    i += 1
    while not lines[i].startswith('}'):
        raw = lines[i].strip()
        i += 1
        if not raw or raw.startswith('//'):
            continue
        if raw.startswith('@@map'):
            table = re.search(r'"(.+?)"', raw).group(1)
            continue
        if raw.startswith('@@'):
            continue
        code, _, note = raw.partition('//')
        parts = code.split()
        fname, ftype, attrs = parts[0], parts[1], ' '.join(parts[2:])
        fields.append((fname, ftype, attrs, note.strip()))
    models.append((name, table or name, ' '.join(doc), fields))

model_names = {m[0] for m in models}
table_of = {m[0]: m[1] for m in models}

def db_type(ftype, attrs):
    base = ftype.rstrip('?[]')
    t = re.search(r'@db\.(\w+)(\([^)]*\))?', attrs)
    if t:
        return t.group(1).replace('VarChar', 'varchar').replace('Timestamptz', 'timestamptz').replace('Decimal', 'decimal').replace('Text', 'text').replace('Citext', 'citext') + (t.group(2) or '')
    if base in enums:
        return f'enum {base}'
    return {'String': 'text', 'Int': 'integer', 'Boolean': 'boolean', 'DateTime': 'timestamp(3)', 'Json': 'jsonb', 'Decimal': 'decimal', 'BigInt': 'bigint'}.get(base, base)

out = []
w = out.append
w('# 17 — Data Dictionary (generated)')
w('')
w('> **Auto-generated from `prisma/schema.prisma`** via `python3 scripts/gen-data-dictionary.py`. Do not edit by hand:')
w('> edit the schema (including comments) then re-run. Generated from the schema, so it matches the live database.')
w('')
w(f'{len(models)} tables · {len(enums)} enums. Convention: code = camelCase field / PascalCase model; database = snake_case')
w('cols / snake_case plural for tables. Every id is a CUID `varchar(30)`, money is `decimal(12,2)`, time is `timestamptz`.')
w('State and transitions: [14-state-machine](14-state-machine.md).')
w('')
w('## Relationship diagram (ER)')
w('')
w('Only real foreign keys are drawn (`..._id` columns). `Company` links to almost every table (single-tenant, 1 row) so it is omitted for readability.')
w('')
w('```mermaid')
w('erDiagram')
edges = []
for name, table, doc, fields in models:
    for fname, ftype, attrs, note in fields:
        base = ftype.rstrip('?[]')
        if base in model_names and 'fields:' in attrs and base != 'Company':
            fk = re.search(r'fields:\s*\[(\w+)\]', attrs).group(1)
            unique = any(f[0] == fk and '@unique' in f[2] for f in fields)
            optional = ftype.endswith('?')
            left = '|o' if optional else '||'
            right = 'o|' if unique else 'o{'
            edges.append(f'    {base} {left}--{right} {name} : "{fk}"')
for e in sorted(set(edges)):
    w(e)
w('```')
w('')
for name, table, doc, fields in models:
    w(f'## {table} (`{name}`)')
    w('')
    if doc:
        w(doc)
        w('')
    w('| Column (database) | Field (code) | Type | Required | Default / constraint | Notes |')
    w('|---|---|---|:-:|---|---|')
    rels = []
    for fname, ftype, attrs, note in fields:
        base = ftype.rstrip('?[]')
        if base in model_names:
            if 'fields:' in attrs:
                fk = re.search(r'fields:\s*\[(\w+)\]', attrs).group(1)
                on_delete = re.search(r'onDelete:\s*(\w+)', attrs)
                rels.append(f'`{fk}` → `{table_of[base]}.id`' + (f' (on delete: {on_delete.group(1)})' if on_delete else ''))
            continue
        col = re.search(r'@map\("(.+?)"\)', attrs)
        col = col.group(1) if col else fname
        req = '' if ftype.endswith('?') else '✓'
        cons = []
        if '@id' in attrs: cons.append('PK')
        if '@unique' in attrs: cons.append('unique')
        d = re.search(r'@default\(((?:[^()]|\([^)]*\))*)\)', attrs)
        if d: cons.append(f'= {d.group(1)}')
        if '@updatedAt' in attrs: cons.append('auto update')
        typ = db_type(ftype, attrs) + ('[]' if ftype.endswith('[]') else '')
        w(f'| `{col}` | `{fname}` | {typ} | {req} | {" · ".join(cons)} | {note.replace("|", "/")} |')
    w('')
    if rels:
        w('Foreign keys: ' + ' · '.join(rels))
        w('')
w('## Enum')
w('')
w('| Enum | Values |')
w('|---|---|')
for e, vals in enums.items():
    w(f'| `{e}` | {" · ".join(vals)} |')
w('')
(ROOT / 'docs/17-data-dictionary.md').write_text('\n'.join(out))
print(f'wrote docs/17-data-dictionary.md: {len(models)} tables, {len(enums)} enums, {len(set(edges))} relations')
