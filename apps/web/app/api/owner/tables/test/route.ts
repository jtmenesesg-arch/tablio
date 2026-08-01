import { NextResponse } from "next/server";
import { tableManagementDemoStore } from "@/lib/table-management-demo-store";

export async function POST() {
  tableManagementDemoStore.reset();
  return NextResponse.json(tableManagementDemoStore.snapshot());
}
