/** Format CLP price: 12990 → "$12.990" */
export function formatCLP(amount: number): string {
  return "$" + amount.toLocaleString("es-CL");
}
