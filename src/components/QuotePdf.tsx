import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import type { QuoteDocData } from '@/components/QuoteDocument'

/**
 * The quotation as a real, downloadable A4 PDF (react-pdf) — the client link serves this inline so the
 * browser opens its own PDF viewer (with native download/print). It mirrors the on-screen QuoteDocument
 * template 1:1, only on a white page. Sizes are the HTML form's px values converted to PDF points
 * (1px = 0.75pt at 96dpi) so the proportions match the HTML exactly: text-2xl(24)->18, text-sm(14)->10.5,
 * text-xs(12)->9, text-5xl(48)->36; spacing 4/8/12/16/24/32px -> 3/6/9/12/18/24pt; 12mm->34pt, 76mm->215,
 * 28mm->79, 34mm->96, 80mm->227. Keep this in visual sync with QuoteDocument.tsx.
 *
 * Colours are literal here (react-pdf has no access to the CSS design tokens) but mirror globals.css:
 * ink #20201e, ink-muted #6f6f69, muted #9c948b, accent #a06a67, line #e7e2da / #ded7cc, sunk #f1ede7,
 * paper #faf9f6. Built-in Helvetica keeps it dependency-free and reliable on serverless.
 */

const C = {
  ink: '#20201e',
  inkMuted: '#6f6f69',
  muted: '#9c948b',
  accent: '#a06a67',
  line: '#e7e2da',
  lineStrong: '#ded7cc',
  sunk: '#f1ede7',
  paper: '#faf9f6',
  white: '#ffffff',
}

const s = StyleSheet.create({
  page: { backgroundColor: C.white, color: C.ink, paddingHorizontal: 34, paddingVertical: 34, fontFamily: 'Helvetica', fontSize: 10.5, lineHeight: 1.5 },

  // Header: MOMENTS + subtitle (left) | Quotation (right)
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 18, textTransform: 'uppercase', color: C.ink, lineHeight: 1 },
  brandSub: { fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: C.accent, marginTop: 4 },
  title: { fontSize: 36, color: C.accent, lineHeight: 1 },

  // Company block | boxed meta fields
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  companyName: { fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 2 },
  companyLine: { color: C.inkMuted },
  metaWrap: { width: 215 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4.5 },
  metaLabel: { width: 79, fontFamily: 'Helvetica-Bold', color: C.ink },
  metaValue: { flexGrow: 1, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 2, backgroundColor: C.paper, paddingHorizontal: 9, paddingVertical: 4, color: C.ink },

  // Accent bands (Customer / Notes / table header) — one shared height
  band: { backgroundColor: C.accent, borderRadius: 2, paddingHorizontal: 9, paddingVertical: 5, marginTop: 18 },
  bandText: { color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  customerName: { marginTop: 6, paddingHorizontal: 3 },
  bold: { fontFamily: 'Helvetica-Bold' },

  // Line-item table
  table: { marginTop: 18, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 2 },
  thead: { flexDirection: 'row', backgroundColor: C.accent },
  th: { color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 9, paddingVertical: 6 },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.line },
  td: { paddingHorizontal: 9, paddingVertical: 6, borderRightWidth: 1, borderColor: C.line },
  tdLast: { paddingHorizontal: 9, paddingVertical: 6 },
  cItem: { width: '8%' },
  cDesc: { width: '46%' },
  cQty: { width: '12%' },
  cUnit: { width: '17%' },
  cAmt: { width: '17%' },
  lineName: { fontFamily: 'Helvetica-Bold', color: C.ink },
  lineDetail: { fontSize: 9, color: C.inkMuted, marginTop: 3, lineHeight: 1.4 },

  // Bottom band (notes + totals)
  bottomRow: { flexDirection: 'row', marginTop: 18 },
  notesCol: { width: '50%', paddingRight: 9 },
  totalsCol: { width: '50%', paddingLeft: 9 },
  notesBox: { marginTop: 6, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 2, backgroundColor: C.paper, padding: 9, minHeight: 96, color: C.inkMuted },
  totalsBox: { marginTop: 6, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 2 },
  totalsRow: { flexDirection: 'row', alignItems: 'center' },
  totalsRowB: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: C.line },
  totalsLabel: { flexGrow: 1, paddingHorizontal: 9, paddingVertical: 4.5, color: C.inkMuted },
  totalsLabelStrong: { flexGrow: 1, paddingHorizontal: 9, paddingVertical: 6, fontFamily: 'Helvetica-Bold', color: C.ink, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 },
  totalsVal: { width: 96, paddingHorizontal: 9, paddingVertical: 4.5, textAlign: 'right', color: C.ink, borderLeftWidth: 1, borderColor: C.line },
  totalsValStrong: { width: 96, paddingHorizontal: 9, paddingVertical: 6, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: C.ink, borderLeftWidth: 1, borderColor: C.line, fontSize: 12 },
  strongBg: { backgroundColor: C.sunk },

  // Closing / signature / footer
  closing: { marginTop: 18, fontFamily: 'Helvetica-Oblique', color: C.inkMuted },
  sigWrap: { marginTop: 24, borderTopWidth: 1, borderColor: C.lineStrong, paddingTop: 15, alignItems: 'flex-end' },
  sigBlock: { width: 227 },
  sigLine: { flexDirection: 'row', alignItems: 'flex-end' },
  sigLabel: { fontFamily: 'Helvetica-Bold', color: C.ink, width: 60 },
  sigRule: { flexGrow: 1, borderBottomWidth: 1, borderColor: C.lineStrong, height: 12 },
  footer: { marginTop: 24, textAlign: 'center', color: C.muted },
})

export function QuotePdf({ doc }: { doc: QuoteDocData }) {
  const dep = doc.depositPercent != null ? computeDeposit(doc.total, doc.depositPercent) : null
  const totals: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Subtotal (ex GST)', value: formatAud(doc.subtotal) },
    { label: 'GST 10%', value: formatAud(doc.taxTotal) },
    { label: 'Total (inc GST)', value: formatAud(doc.total), strong: true },
    ...(dep
      ? [
          { label: `Deposit (${doc.depositPercent}%)`, value: formatAud(dep.deposit) },
          { label: 'Balance due', value: formatAud(dep.balance) },
        ]
      : []),
  ]

  return (
    <Document title={`Quotation ${doc.number}`} author="Moments Photography and Film">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand}>Moments</Text>
            <Text style={s.brandSub}>Photography and Film</Text>
          </View>
          <Text style={s.title}>Quotation</Text>
        </View>

        {/* Company + meta */}
        <View style={s.infoRow}>
          <View>
            <Text style={s.companyName}>Moments Photography and Film</Text>
            <Text style={s.companyLine}>Sydney, NSW, Australia</Text>
            <Text style={s.companyLine}>momentsphotography.com.au</Text>
          </View>
          <View style={s.metaWrap}>
            <View style={s.metaRow}><Text style={s.metaLabel}>Date</Text><Text style={s.metaValue}>{doc.issueDate ? formatSydneyDate(doc.issueDate) : '-'}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Quote #</Text><Text style={s.metaValue}>{doc.number}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Valid until</Text><Text style={s.metaValue}>{doc.validUntil ? formatSydneyDate(doc.validUntil) : '-'}</Text></View>
          </View>
        </View>

        {/* Customer band */}
        <View style={{ width: '52%' }}>
          <View style={s.band}><Text style={s.bandText}>Customer</Text></View>
          <Text style={s.customerName}><Text style={s.bold}>Name: </Text>{doc.clientName}</Text>
        </View>

        {/* Line items */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, s.cItem, { textAlign: 'center' }]}>Item</Text>
            <Text style={[s.th, s.cDesc]}>Description</Text>
            <Text style={[s.th, s.cQty, { textAlign: 'center' }]}>Qty</Text>
            <Text style={[s.th, s.cUnit, { textAlign: 'right' }]}>Unit price</Text>
            <Text style={[s.th, s.cAmt, { textAlign: 'right' }]}>Amount</Text>
          </View>
          {doc.lines.map((line, i) => (
            <View key={line.id} style={[s.tr, i % 2 === 1 ? { backgroundColor: C.paper } : {}]} wrap={false}>
              <Text style={[s.td, s.cItem, { textAlign: 'center', color: C.inkMuted }]}>{i + 1}</Text>
              <View style={[s.td, s.cDesc]}>
                <Text style={s.lineName}>{line.description}</Text>
                {line.details ? <Text style={s.lineDetail}>{line.details}</Text> : null}
              </View>
              <Text style={[s.td, s.cQty, { textAlign: 'center' }]}>{line.quantity}</Text>
              <Text style={[s.td, s.cUnit, { textAlign: 'right' }]}>{formatAud(line.unitPrice)}</Text>
              <Text style={[s.tdLast, s.cAmt, { textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatAud(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        {/* Notes + Totals */}
        <View style={s.bottomRow}>
          <View style={s.notesCol}>
            <View style={s.band}><Text style={s.bandText}>Notes or special comments</Text></View>
            <Text style={s.notesBox}>{doc.notes ?? ''}</Text>
          </View>
          <View style={s.totalsCol}>
            <View style={s.totalsBox}>
              {totals.map((t, i) => (
                <View key={t.label} style={[i > 0 ? s.totalsRowB : s.totalsRow, t.strong ? s.strongBg : {}]}>
                  <Text style={t.strong ? s.totalsLabelStrong : s.totalsLabel}>{t.label}</Text>
                  <Text style={t.strong ? s.totalsValStrong : s.totalsVal}>{t.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Courtesy */}
        <Text style={s.closing}>We would be glad to answer any questions about this quotation, and we look forward to capturing your special moments.</Text>

        {/* Signature */}
        <View style={s.sigWrap}>
          <View style={s.sigBlock}>
            <View style={s.sigLine}><Text style={s.sigLabel}>Signature</Text><Text style={s.sigRule}> </Text></View>
            <View style={[s.sigLine, { marginTop: 15 }]}><Text style={s.sigLabel}>Date</Text><Text style={s.sigRule}> </Text></View>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>Thank you for your business!</Text>
      </Page>
    </Document>
  )
}
