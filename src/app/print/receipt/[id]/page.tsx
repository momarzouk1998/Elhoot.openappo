import { redirect } from 'next/navigation';

export default async function ReceiptRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/print/payment/customer/${id}`);
}
