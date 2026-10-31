import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatementText, tidyPayee } from '../src/lib/ai/statement-parser.ts';

// Shaped like Workers AI toMarkdown output for a UPI app statement: words run together across columns.
const UPI_APP = `### Page 1
TEST USER+91 9000000000Transaction statement from 01 Sep 2026 to 31 Oct 2026All UPI, bill payments & recharges are listed in this statementDate Transaction details Account Amount31 Oct 20268:42 AMPaid to Fresh Mart Pvt LtdUPI txn ID: 006430428694
Note: Paid super fast with UPIExample Bank - 1234 ₹150
30 Oct 20264:48 PMPaid to RAVI KUMAR SO RAM LALUPI txn ID: 666811333974
Note: Paid via UPIExample Bank - 1234 ₹15,000
### Page 2
TEST USER+91 9000000000Date Transaction details Account Amount22 Oct 20269:59 PMReceived from PayUUPI txn ID: 682751252956
Note: BLINK COMMERCE PRIV 3143636645Example Bank - 1234 ₹96.50
28 Oct 20267:28 PMBill payment of Example Credit cardUPI txn ID: 1
Example Bank - 1234 ₹6,017.98
25 Oct 20269:10 AMUPI Lite top-upUPI txn ID: 629854033372Example Bank - 1234 ₹100
24 Oct 202612:05 PMRecharge of AIRTELUPI txn ID: 2Example Bank - 1234 ₹349`;

describe('parseStatementText', () => {
  const rows = parseStatementText(UPI_APP);

  it('reads every row with exact amounts, dates and times', () => {
    assert.ok(rows);
    assert.equal(rows.length, 6);
    assert.deepEqual(
      rows.map((r) => [r.date, r.time, r.amount]),
      [
        ['2026-10-31', '08:42', 150],
        ['2026-10-30', '16:48', 15000],
        ['2026-10-22', '21:59', 96.5],
        ['2026-10-28', '19:28', 6017.98],
        ['2026-10-25', '09:10', 100],
        ['2026-10-24', '12:05', 349],
      ]
    );
  });

  it('takes direction from the row text, not a guess', () => {
    assert.equal(rows[1].transaction_type, 'expense'); // "Paid to" a person is never income
    assert.equal(rows[2].transaction_type, 'income');
  });

  it('tidies payees and keeps only useful notes', () => {
    assert.equal(rows[0].payee, 'Fresh Mart Pvt Ltd');
    assert.equal(rows[0].note, null);
    assert.equal(rows[1].payee, 'Ravi Kumar');
    assert.equal(rows[2].note, 'BLINK COMMERCE PRIV 3143636645');
    assert.equal(rows[5].payee, 'Airtel');
  });

  it('flags card bills and wallet top-ups as moving your own money', () => {
    assert.deepEqual(
      rows.map((r) => r.internal),
      [false, false, false, true, true, false]
    );
  });

  it('gives up on layouts it does not understand', () => {
    const bankTable = `01/10/2026 UPI/DR/1234/SWIGGY 450.00 12,000.00
02/10/2026 NEFT CR ACME SALARY 50,000.00 62,000.00
03/10/2026 ATM WDL 2,000.00 60,000.00`;
    assert.equal(parseStatementText(bankTable), null);
  });
});

describe('tidyPayee', () => {
  it('drops relations and titles', () => {
    assert.equal(tidyPayee('Paid to NEETA SHARMA WO MOHAN LAL'), 'Neeta Sharma');
    assert.equal(tidyPayee('Received from Ms RITU'), 'Ritu');
    assert.equal(tidyPayee('Paid to Durga Singh S/o Ram Prasad'), 'Durga Singh');
  });
});

describe('namesMatch', () => {
  it('matches what the user typed against statement names, typos included', async () => {
    const { namesMatch } = await import('../src/lib/ai/payee-match.ts');
    assert.equal(namesMatch('price kumar', 'Prince Kumar'), true);
    assert.equal(namesMatch('all Prince Kumar payments', 'Prince Kumar'), true);
    assert.equal(namesMatch('blinkit wale', 'Blinkit Commerce Private Limited'), true);
    assert.equal(namesMatch('prince', 'Prince Kumar'), true);
    assert.equal(namesMatch('price kumar', 'Parveen Kumar Dua'), false);
    assert.equal(namesMatch('ravi', 'Ravi Kumar'), true);
    assert.equal(namesMatch('ravi', 'Rajiv Kumar'), false);
    assert.equal(namesMatch('payments', 'Prince Kumar'), false);
  });
});
