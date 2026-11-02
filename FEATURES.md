# Attendance & Payroll — 100 Feature Ideas (status after v2.0)

✅ = built (v1.0 + the 50 picked for v2.0). Unticked items remain ideas for later.

## A. Marking attendance (1–15)
1. ✅ One-screen daily marking with P / H / HPL / PL / UL / A / WO / HO chips
2. ✅ In / Out time with one-tap "Now" buttons
3. ✅ Auto status from hours worked (full / half / absent), editable
4. ✅ Late badge when In time is after the set time
5. ✅ Bulk "all not-marked → Present / Absent"
6. ✅ Edit window for the in-charge (today + last N days)
7. ✅ Self check-in by staff from their own phone, approved by in-charge — *automatic now — staff can only *request* corrections*
8. ✅ QR code at the office door — staff scan to check in/out
9. ✅ GPS / geofence check — check-in allowed only within ~100 m of the Airoli office
10. ✅ Selfie photo at check-in (stored compressed) to stop proxy attendance
11. ✅ Office Wi-Fi check — check-in allowed only on office network — *checks the phone is on the same internet as the office PC*
12. ✅ Break tracking (lunch out / lunch in) with break-overrun alert
13. "On field visit" status for society visits, with society name & purpose
14. Multiple in/out punches in a day (e.g. bank visit in between)
15. ✅ Early-leaving flag with reason when Out is before office end

## B. Leave management (16–30)
16. ✅ Paid leave balance with monthly credit, carry forward, April reset
17. ✅ PL beyond balance automatically becomes LOP
18. ✅ Half day + half paid leave (HPL)
19. ✅ Online leave application by staff (dates, type, reason)
20. ✅ Leave approval / rejection by admin with comment
21. ✅ Leave auto-fills the register once approved
22. Separate leave types: Casual, Sick, Earned, Comp-off, Maternity
23. ✅ Sick leave beyond 2 days needs a medical note upload
24. ✅ Compensatory off earned for working on a Tuesday / holiday
25. Sandwich rule (leave on both sides of a weekly off counts the off too) — optional
26. Leave encashment at year end
27. ✅ Blackout dates (no leave allowed near audit / ITR deadlines)
28. ✅ Team leave calendar so two people aren't off together
29. Maximum consecutive-leave limit
30. Leave history and balance statement per staff (printable)

## C. Salary & payroll (31–50)
31. ✅ Per-day = monthly ÷ days in month; LOP deduction
32. ✅ Extra pay for working on weekly off / holiday
33. ✅ Bonus / incentive, advance recovery, other deductions
34. ✅ Printable B&W payslip with amount in words
35. ✅ Lock month after salary is finalised
36. Salary components: Basic, HRA, Conveyance, Special allowance
37. Overtime by hours (after 6 PM) at a set hourly rate
38. Late-mark deduction rule (already available as a setting — tune slabs: 3 lates = ½ day, 6 = 1 day)
39. Salary advance / loan register with EMI auto-deduction
40. Professional Tax (Maharashtra slabs) auto-deduction
41. PF / ESIC calculation, if the firm crosses the thresholds later
42. ✅ Salary revision history with effective dates (arrears auto-calculated)
43. Performance incentive linked to weekly staff ranking (Wed–Mon)
44. ✅ Diwali bonus calculator
45. ✅ Payslip PDF emailed / WhatsApped to each staff — *emailed as PDF + WhatsApp summary + in the staff app*
46. Bank transfer sheet (NEFT bulk upload format)
47. ✅ Salary register for the year (Form-style) for audit file
48. ✅ Mid-month joiner / leaver pro-rata (partly in v1 via joining/leaving date)
49. ✅ Full & final settlement on resignation
50. ✅ Two-PDF payslip output: signed & stamped, and unsigned

## D. Staff records (51–62)
51. ✅ Staff list with Emp ID, designation, salary, join/leave dates
52. ✅ Active / inactive staff
53. Photo, address, emergency contact, blood group (optional)
54. Document vault: Aadhaar/PAN copies, offer letter (base64, free tier)
55. Link to existing staff ID card verify page (verify-id.html?id=SS-xxxxx)
56. Probation tracking with confirmation reminder
57. ✅ Birthday & work-anniversary reminders
58. ✅ Offer letter / experience letter / relieving letter generator
59. ✅ Asset issued register (laptop, keys, ID card)
60. Notice period tracking
61. Staff skill / work-allocation notes (which societies each handles)
62. ✅ Shift / timing per person (if someone works 10–7)

## E. Reports & analytics (63–77)
63. ✅ Monthly register grid with print
64. ✅ Excel export: register, salary, daily in-out
65. ✅ Activity log of every change
66. ✅ Dashboard: today's present count, monthly attendance %, trend chart (Chart.js)
67. ✅ Late-comer report and ranking
68. ✅ Average arrival / departure time per staff
69. ✅ Total hours worked per week / month
70. ✅ Absenteeism pattern (e.g. frequent Monday/Wednesday absences)
71. ✅ Year-wise attendance summary per staff
72. Leave utilisation report
73. ✅ Salary cost trend month by month
74. ✅ Attendance % feeding into weekly staff ranking
75. ✅ Monthly PDF report emailed to partners automatically — *11 PM on the last day*
76. ✅ Compare months side by side
77. ✅ Custom date-range report (e.g. FY April–March)

## F. Notifications & reminders (78–86)
78. ✅ 9:30 AM reminder to the in-charge if attendance isn't marked — *staff reminded 30 min after shift start; admins get a morning summary*
79. ✅ Push notification to admins when someone is absent / late
80. WhatsApp message to staff when marked absent (click-to-chat link)
81. Day-end reminder: staff still "in office" without Out time
82. ✅ Month-end reminder to finalise and lock salary
83. ✅ Leave request alerts to admins
84. ✅ Holiday announcement to all staff
85. Low PL balance warning to staff
86. Daily summary message ready to paste in the office WhatsApp group

## G. Security & control (87–94)
87. ✅ PIN login per person (SHA-256), roles: Admin / In-charge / Staff
88. ✅ Firebase anonymous auth + database rules
89. ✅ Backup download / restore (JSON)
90. ✅ Auto-lock after X minutes idle
91. ✅ Admin approval needed for edits older than N days
92. ✅ Edit reason mandatory when changing a past record
93. ✅ Device binding — in-charge can mark only from the office PC/phone
94. Scheduled automatic backup to Google Drive / email

## H. Usability & platform (95–100)
95. ✅ PWA install (home-screen icon, works like an app on Android/iPhone)
96. ✅ Offline marking that syncs when internet returns — *app opens offline with last data; scanning needs internet by design*
97. Marathi / English language toggle
98. ✅ Dark mode
99. ✅ Holiday list import (Maharashtra public holidays) in one click
100. ✅ Merge into the planned unified Shreedeep Solutions portal (shared login with TaskFlow / HabitFlow) — *step-by-step plan in README*
