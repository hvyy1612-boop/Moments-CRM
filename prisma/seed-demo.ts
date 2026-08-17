
import { prisma } from '../src/lib/db'
import { assignResource, createBooking } from '../src/lib/domain/booking'
import {
  createContractFromAcceptedQuote,
  sendContract,
  signContractByToken,
} from '../src/lib/domain/contract'
import { addGalleryItem, createGallery, publishGallery } from '../src/lib/domain/delivery'
import { createInvoice, issueInvoice, recordPayment } from '../src/lib/domain/finance'
import { createProjectFromEnquiry } from '../src/lib/domain/project'
import { acceptQuoteByToken, createQuote, saveQuoteDraft, sendQuote } from '../src/lib/domain/quote'

const IP = '203.0.113.10'

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  const adminId = admin?.id ?? null
  const leadPhotographer = await prisma.resource.findFirst({ where: { name: 'Lead Photographer' } })

  const alreadyLoaded = await prisma.client.findUnique({ where: { email: 'sofia.james@demo.moments' } })
  if (alreadyLoaded) {
    console.log('Demo data already present — skipping.')
    return
  }

  await createProjectFromEnquiry({
    name: 'Ella and Marcus',
    email: 'ella.marcus@demo.moments',
    eventType: 'Wedding',
    message: 'Beach ceremony at Bronte, around 60 guests, February 2027.',
  })

  {
    const project = await createProjectFromEnquiry({
      name: 'Sofia and James',
      email: 'sofia.james@demo.moments',
      eventType: 'Wedding',
      message: 'City Hall ceremony and a reception in Surry Hills.',
    })
    const { quoteId, versionId } = await createQuote(project.id, adminId)
    await saveQuoteDraft(versionId, [{ description: 'Full-day wedding photography', quantity: 1, unitPrice: '4200' }], null)
    await sendQuote(quoteId, adminId)
  }

  {
    const project = await createProjectFromEnquiry({
      name: 'Priya and Daniel',
      email: 'priya.daniel@demo.moments',
      eventType: 'Wedding',
      message: 'Garden wedding in the Hunter Valley.',
    })
    const { quoteId, versionId } = await createQuote(project.id, adminId)
    await saveQuoteDraft(versionId, [{ description: 'Wedding photography and film', quantity: 1, unitPrice: '6800' }], null)
    const { viewToken } = await sendQuote(quoteId, adminId)
    await acceptQuoteByToken(viewToken, 'Priya', IP)
    const contract = await createContractFromAcceptedQuote(project.id, adminId)
    await sendContract(contract.contractId, adminId)
  }

  {
    const project = await createProjectFromEnquiry({
      name: 'Grace and Tom',
      email: 'grace.tom@demo.moments',
      eventType: 'Wedding',
      message: 'Vineyard wedding, late spring.',
    })
    const { quoteId, versionId } = await createQuote(project.id, adminId)
    await saveQuoteDraft(versionId, [{ description: 'Wedding photography', quantity: 1, unitPrice: '5200' }], null)
    const { viewToken } = await sendQuote(quoteId, adminId)
    await acceptQuoteByToken(viewToken, 'Grace', IP)
    const contract = await createContractFromAcceptedQuote(project.id, adminId)
    const { signToken } = await sendContract(contract.contractId, adminId)
    await signContractByToken(signToken, 'Grace', IP)
    const booking = await createBooking(
      project.id,
      { title: 'Wedding day', startsAt: '2027-03-20T13:00', endsAt: '2027-03-20T21:00', location: 'Sergeants Mess, Mosman' },
      adminId,
    )
    if (leadPhotographer) await assignResource(booking.id, { resourceId: leadPhotographer.id, role: 'Lead' }, adminId)
    const invoice = await createInvoice(project.id, { type: 'DEPOSIT', description: 'Booking deposit', amount: '1560' }, adminId)
    await issueInvoice(invoice.id, adminId)
  }

  {
    const project = await createProjectFromEnquiry({
      name: 'Hannah and Leo',
      email: 'hannah.leo@demo.moments',
      eventType: 'Wedding',
      message: 'Rooftop wedding in the CBD.',
    })
    const { quoteId, versionId } = await createQuote(project.id, adminId)
    await saveQuoteDraft(versionId, [{ description: 'Wedding photography and album', quantity: 1, unitPrice: '5800' }], null)
    const { viewToken } = await sendQuote(quoteId, adminId)
    await acceptQuoteByToken(viewToken, 'Hannah', IP)
    const contract = await createContractFromAcceptedQuote(project.id, adminId)
    const { signToken } = await sendContract(contract.contractId, adminId)
    await signContractByToken(signToken, 'Hannah', IP)
    const booking = await createBooking(
      project.id,
      { title: 'Wedding day', startsAt: '2026-03-15T14:00', endsAt: '2026-03-15T22:00', location: 'The Grounds of Alexandria' },
      adminId,
    )
    if (leadPhotographer) await assignResource(booking.id, { resourceId: leadPhotographer.id, role: 'Lead' }, adminId)
    const invoice = await createInvoice(project.id, { type: 'BALANCE', description: 'Wedding photography — full payment', amount: '5800' }, adminId)
    await issueInvoice(invoice.id, adminId)
    await recordPayment(invoice.id, { paymentMethod: 'BANK_TRANSFER', amount: '5800', reference: 'DEMO-PAY-0001' }, adminId)
    const gallery = await createGallery(project.id, { title: 'Hannah & Leo — Wedding gallery' }, adminId)
    await addGalleryItem(gallery.id, { caption: 'Full gallery', url: 'https://example.com/hannah-leo-gallery' }, adminId)
    await addGalleryItem(gallery.id, { caption: 'Highlight film', url: 'https://example.com/hannah-leo-film' }, adminId)
    await publishGallery(gallery.id, adminId)
  }

  console.log('Demo data loaded: 5 projects across enquiry, quoting, awaiting decision, confirmed, and completed.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
