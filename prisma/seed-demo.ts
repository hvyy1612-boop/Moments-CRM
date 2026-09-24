/**
 * Rich demo data so the workspace has something to explore: five projects spread across the whole
 * lifecycle, each built by running the real domain flow (not inserted raw), so every state is
 * consistent. Idempotent — running it twice does not duplicate. Load it wherever DATABASE_URL points:
 *
 *   npm run seed:demo
 */
import { prisma } from '../src/lib/db'
import { assignResource, createBooking } from '../src/lib/domain/booking'
import { addContact } from '../src/lib/domain/contact'
import {
  createContractFromAcceptedQuote,
  sendContract,
  signContractByToken,
} from '../src/lib/domain/contract'
import { addGalleryItem, createGallery, publishGallery } from '../src/lib/domain/delivery'
import { confirmBookingByToken, createProjectFromPackage } from '../src/lib/domain/direct-booking'
import { convertEnquiry, createEnquiry, markEnquiryLost } from '../src/lib/domain/enquiry'
import { createInvoice, issueInvoice, recordPayment } from '../src/lib/domain/finance'
import { createPackage } from '../src/lib/domain/package'
import { createProjectFromEnquiry } from '../src/lib/domain/project'
import { createQuote, saveQuoteDraft, sendQuote } from '../src/lib/domain/quote'

const IP = '203.0.113.10'

// Accept a demo project-stage quote directly. The client-token accept path was retired (docs/31 section
// 7); these seed quotes are created with createQuote(projectId), so they already carry projectId.
async function acceptDemoQuote(quoteId: string, versionId: string, projectId: string, name: string) {
  await prisma.quoteVersion.update({ where: { id: versionId }, data: { status: 'ACCEPTED', acceptedByClientName: name, acceptedByClientAt: new Date() } })
  await prisma.quote.update({ where: { id: quoteId }, data: { status: 'ACCEPTED' } })
  await prisma.project.update({ where: { id: projectId }, data: { commercialStatus: 'ACCEPTED' } })
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  const adminId = admin?.id ?? null
  const leadPhotographer = await prisma.resource.findFirst({ where: { name: 'Lead Photographer' } })

  const alreadyLoaded = await prisma.client.findUnique({ where: { email: 'sofia.james@demo.moments' } })
  if (alreadyLoaded) {
    console.log('Demo data already present — skipping.')
    return
  }

  // 1. Fresh enquiry, nothing done yet.
  await createProjectFromEnquiry({
    name: 'Ella and Marcus',
    email: 'ella.marcus@demo.moments',
    eventType: 'Wedding',
    message: 'Beach ceremony at Bronte, around 60 guests, February 2027.',
  })

  // 2. Quote sent, waiting on the client.
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

  // 3. Quote accepted, contract sent, waiting on signature.
  {
    const project = await createProjectFromEnquiry({
      name: 'Priya and Daniel',
      email: 'priya.daniel@demo.moments',
      eventType: 'Wedding',
      message: 'Garden wedding in the Hunter Valley.',
    })
    const { quoteId, versionId } = await createQuote(project.id, adminId)
    await saveQuoteDraft(versionId, [{ description: 'Wedding photography and film', quantity: 1, unitPrice: '6800' }], null)
    await sendQuote(quoteId, adminId)
    await acceptDemoQuote(quoteId, versionId, project.id, 'Priya')
    const contract = await createContractFromAcceptedQuote(project.id, adminId)
    await sendContract(contract.contractId, adminId)
  }

  // 4. Confirmed: contract signed, shoot booked with crew, deposit issued.
  {
    const project = await createProjectFromEnquiry({
      name: 'Grace and Tom',
      email: 'grace.tom@demo.moments',
      eventType: 'Wedding',
      message: 'Vineyard wedding, late spring.',
    })
    const { quoteId, versionId } = await createQuote(project.id, adminId)
    await saveQuoteDraft(versionId, [{ description: 'Wedding photography', quantity: 1, unitPrice: '5200' }], null)
    await sendQuote(quoteId, adminId)
    await acceptDemoQuote(quoteId, versionId, project.id, 'Grace')
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

  // 5. Completed: paid in full and the gallery delivered.
  {
    const project = await createProjectFromEnquiry({
      name: 'Hannah and Leo',
      email: 'hannah.leo@demo.moments',
      eventType: 'Wedding',
      message: 'Rooftop wedding in the CBD.',
    })
    const { quoteId, versionId } = await createQuote(project.id, adminId)
    await saveQuoteDraft(versionId, [{ description: 'Wedding photography and album', quantity: 1, unitPrice: '5800' }], null)
    await sendQuote(quoteId, adminId)
    await acceptDemoQuote(quoteId, versionId, project.id, 'Hannah')
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

  // ----- B2 backend demo: packages, leads (enquiries), direct booking, contacts -----
  // Packages (fixed-price catalogue).
  const weddingPkg = await createPackage(
    {
      name: 'Wedding — Full Day',
      description: '8 hours coverage with two photographers and an edited online gallery.',
      inclusions: '8 hours coverage\nTwo photographers\nOnline gallery\n60 edited images',
      durationHours: 8,
      basePriceInclGst: '3500',
      sortOrder: 1,
    },
    adminId,
  )
  await createPackage(
    {
      name: 'Portrait Session',
      description: 'One-hour studio portrait session.',
      inclusions: '1 hour session\n20 edited images',
      durationHours: 1,
      basePriceInclGst: '450',
      sortOrder: 2,
    },
    adminId,
  )

  // Leads (enquiries) at different stages — not yet clients.
  await createEnquiry(
    { name: 'Mia Tran', email: 'mia.tran@demo.moments', eventType: 'Wedding', message: 'Are you free next November?', source: 'WEBSITE' },
    adminId,
  )
  const lostLead = await createEnquiry(
    { name: 'Tom Baker', email: 'tom.baker@demo.moments', eventType: 'Portrait', message: 'Just checking prices.', source: 'INSTAGRAM' },
    adminId,
  )
  await markEnquiryLost(lostLead.id, 'Budget too low for now', adminId)
  const qualifiedLead = await createEnquiry(
    { name: 'Priya and Sam', email: 'priya.sam@demo.moments', eventType: 'Engagement', message: 'Engagement shoot at the botanic gardens.', source: 'REFERRAL' },
    adminId,
  )
  await convertEnquiry(qualifiedLead.id, adminId) // lead → client + project

  // Direct package booking (skips the lead stage) → confirmed by the client.
  const directBooking = await createProjectFromPackage({
    packageId: weddingPkg.id,
    name: 'Olivia and Ben',
    email: 'olivia.ben@demo.moments',
    eventType: 'Wedding',
    message: 'Chose the full-day package online.',
  })
  await confirmBookingByToken(directBooking.confirmToken!)

  // Contacts on a client (a couple = one client, two contacts).
  const contactClient = await prisma.client.findUnique({ where: { email: 'priya.sam@demo.moments' } })
  if (contactClient) {
    await addContact(
      contactClient.id,
      { name: 'Priya', email: 'priya@demo.moments', phone: '0412 100 200', role: 'PRIMARY', isBilling: true },
      adminId,
    )
    await addContact(
      contactClient.id,
      { name: 'Sam', email: 'sam@demo.moments', phone: '0412 100 201', role: 'PARTNER' },
      adminId,
    )
  }

  console.log(
    'Demo data loaded: projects across the lifecycle + 2 packages, 3 enquiries (new/lost/converted), a direct booking, and contacts.',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
