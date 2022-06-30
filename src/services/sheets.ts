import {
  GoogleSpreadsheet,
  GoogleSpreadsheetRow,
  GoogleSpreadsheetWorksheet,
  ServiceAccountCredentials,
} from "google-spreadsheet";
import key from "../../gcp-service-account.key.json";

export interface Data {
  [header: string]: string | number | boolean;
}

export async function init(spreadsheetId: string): Promise<GoogleSpreadsheet> {
  const doc = new GoogleSpreadsheet(spreadsheetId);
  await doc.useServiceAccountAuth(key as ServiceAccountCredentials);
  await doc.loadInfo();
  return doc;
}

export async function save(
  doc: GoogleSpreadsheet,
  sheetTitle: string,
  data: Data[]
): Promise<void> {
  const sheet = await upsertSheet(doc, sheetTitle);
  await sheet.clear();

  const header = Object.keys(data[0]);
  await sheet.setHeaderRow(header);
  await sheet.addRows(data);
}

export async function read(
  doc: GoogleSpreadsheet,
  sheetTitle: string
): Promise<GoogleSpreadsheetRow[]> {
  const sheet = doc.sheetsByTitle[sheetTitle];
  return sheet.getRows();
}

export function link(title: string, link: string): string {
  return title && link ? `=HYPERLINK("${link}", "${title}")` : "";
}

export async function append(
  doc: GoogleSpreadsheet,
  sheetTitle: string,
  data: Data[]
): Promise<void> {
  const sheet = doc.sheetsByTitle[sheetTitle];
  await sheet.addRows(data);
}

export async function upsertSheet(
  doc: GoogleSpreadsheet,
  sheetTitle: string
): Promise<GoogleSpreadsheetWorksheet> {
  const sheet = doc.sheetsByTitle[sheetTitle];
  if (sheet) {
    return sheet;
  } else {
    const newSheet = await doc.addSheet({ title: sheetTitle });
    return newSheet;
  }
}
