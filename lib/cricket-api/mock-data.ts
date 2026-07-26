import type { HeadToHeadRecord, Player, TeamFormEntry, TeamInfo, UpcomingMatch } from "./types";

export const MOCK_TEAMS: Record<string, TeamInfo> = {
  MI: { id: "MI", name: "Mumbai Indians", shortName: "MI", logoUrl: "/logos/mi.svg" },
  CSK: { id: "CSK", name: "Chennai Super Kings", shortName: "CSK", logoUrl: "/logos/csk.svg" },
  RCB: { id: "RCB", name: "Royal Challengers Bengaluru", shortName: "RCB", logoUrl: "/logos/rcb.svg" },
  KKR: { id: "KKR", name: "Kolkata Knight Riders", shortName: "KKR", logoUrl: "/logos/kkr.svg" },
};

function form(points: number[], base: Partial<Player["recentForm"][number]> = {}) {
  return points.map((fantasyPoints, i) => ({
    date: new Date(Date.now() - (5 - i) * 4 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    opponent: "Opponent XI",
    result: (fantasyPoints > 30 ? "W" : "L") as "W" | "L",
    fantasyPoints,
    ...base,
  }));
}

export const MOCK_PLAYERS: Record<string, Player[]> = {
  MI: [
    { id: "mi-1", name: "Rohit Sharma", role: "BAT", teamId: "MI", photoUrl: "/players/mi-1.png", credits: 9.5, recentForm: form([65, 40, 12, 88, 30], { runsScored: 45 }) },
    { id: "mi-2", name: "Ishan Kishan", role: "WK", teamId: "MI", photoUrl: "/players/mi-2.png", credits: 8.5, recentForm: form([55, 20, 45, 15, 60], { runsScored: 39 }) },
    { id: "mi-3", name: "Suryakumar Yadav", role: "BAT", teamId: "MI", photoUrl: "/players/mi-3.png", credits: 9.0, recentForm: form([70, 55, 10, 42, 90], { runsScored: 53 }) },
    { id: "mi-4", name: "Tilak Varma", role: "BAT", teamId: "MI", photoUrl: "/players/mi-4.png", credits: 8.0, recentForm: form([35, 48, 20, 33, 25], { runsScored: 32 }) },
    { id: "mi-5", name: "Hardik Pandya", role: "AR", teamId: "MI", photoUrl: "/players/mi-5.png", credits: 9.0, recentForm: form([60, 45, 38, 52, 30], { runsScored: 30, wicketsTaken: 1 }) },
    { id: "mi-6", name: "Tim David", role: "AR", teamId: "MI", photoUrl: "/players/mi-6.png", credits: 8.0, recentForm: form([30, 55, 15, 40, 22], { runsScored: 25 }) },
    { id: "mi-7", name: "Piyush Chawla", role: "BOWL", teamId: "MI", photoUrl: "/players/mi-7.png", credits: 7.5, recentForm: form([25, 40, 15, 30, 20], { wicketsTaken: 2 }) },
    { id: "mi-8", name: "Jasprit Bumrah", role: "BOWL", teamId: "MI", photoUrl: "/players/mi-8.png", credits: 10.0, recentForm: form([75, 60, 45, 80, 55], { wicketsTaken: 3 }) },
    { id: "mi-9", name: "Trent Boult", role: "BOWL", teamId: "MI", photoUrl: "/players/mi-9.png", credits: 8.5, recentForm: form([40, 65, 30, 45, 50], { wicketsTaken: 2 }) },
    { id: "mi-10", name: "Akash Madhwal", role: "BOWL", teamId: "MI", photoUrl: "/players/mi-10.png", credits: 7.0, recentForm: form([20, 35, 45, 15, 30], { wicketsTaken: 1 }) },
    { id: "mi-11", name: "Nehal Wadhera", role: "BAT", teamId: "MI", photoUrl: "/players/mi-11.png", credits: 7.5, recentForm: form([28, 33, 18, 40, 22], { runsScored: 28 }) },
    { id: "mi-12", name: "Romario Shepherd", role: "AR", teamId: "MI", photoUrl: "/players/mi-12.png", credits: 7.5, recentForm: form([32, 20, 48, 25, 35], { runsScored: 20, wicketsTaken: 1 }) },
  ],
  CSK: [
    { id: "csk-1", name: "Ruturaj Gaikwad", role: "BAT", teamId: "CSK", photoUrl: "/players/csk-1.png", credits: 9.0, recentForm: form([80, 45, 60, 20, 55], { runsScored: 52 }) },
    { id: "csk-2", name: "Devon Conway", role: "WK", teamId: "CSK", photoUrl: "/players/csk-2.png", credits: 8.5, recentForm: form([50, 65, 30, 40, 45], { runsScored: 46 }) },
    { id: "csk-3", name: "Ajinkya Rahane", role: "BAT", teamId: "CSK", photoUrl: "/players/csk-3.png", credits: 8.0, recentForm: form([35, 50, 25, 60, 30], { runsScored: 40 }) },
    { id: "csk-4", name: "Shivam Dube", role: "AR", teamId: "CSK", photoUrl: "/players/csk-4.png", credits: 8.5, recentForm: form([55, 40, 65, 30, 50], { runsScored: 48, wicketsTaken: 0 }) },
    { id: "csk-5", name: "Ravindra Jadeja", role: "AR", teamId: "CSK", photoUrl: "/players/csk-5.png", credits: 9.0, recentForm: form([60, 50, 45, 55, 65], { runsScored: 25, wicketsTaken: 2 }) },
    { id: "csk-6", name: "MS Dhoni", role: "WK", teamId: "CSK", photoUrl: "/players/csk-6.png", credits: 8.5, recentForm: form([30, 45, 20, 50, 35], { runsScored: 30 }) },
    { id: "csk-7", name: "Deepak Chahar", role: "BOWL", teamId: "CSK", photoUrl: "/players/csk-7.png", credits: 8.0, recentForm: form([45, 30, 55, 20, 40], { wicketsTaken: 2 }) },
    { id: "csk-8", name: "Matheesha Pathirana", role: "BOWL", teamId: "CSK", photoUrl: "/players/csk-8.png", credits: 8.0, recentForm: form([50, 65, 35, 45, 60], { wicketsTaken: 3 }) },
    { id: "csk-9", name: "Tushar Deshpande", role: "BOWL", teamId: "CSK", photoUrl: "/players/csk-9.png", credits: 7.0, recentForm: form([25, 40, 30, 20, 35], { wicketsTaken: 1 }) },
    { id: "csk-10", name: "Maheesh Theekshana", role: "BOWL", teamId: "CSK", photoUrl: "/players/csk-10.png", credits: 7.5, recentForm: form([35, 25, 45, 30, 40], { wicketsTaken: 2 }) },
    { id: "csk-11", name: "Shaik Rasheed", role: "BAT", teamId: "CSK", photoUrl: "/players/csk-11.png", credits: 7.0, recentForm: form([20, 25, 30, 15, 22], { runsScored: 22 }) },
    { id: "csk-12", name: "Mitchell Santner", role: "AR", teamId: "CSK", photoUrl: "/players/csk-12.png", credits: 7.5, recentForm: form([30, 35, 20, 40, 28], { runsScored: 15, wicketsTaken: 1 }) },
  ],
  RCB: [
    { id: "rcb-1", name: "Virat Kohli", role: "BAT", teamId: "RCB", photoUrl: "/players/rcb-1.png", credits: 10.0, recentForm: form([75, 60, 85, 40, 55], { runsScored: 63 }) },
    { id: "rcb-2", name: "Faf du Plessis", role: "BAT", teamId: "RCB", photoUrl: "/players/rcb-2.png", credits: 8.5, recentForm: form([50, 45, 60, 30, 40], { runsScored: 45 }) },
    { id: "rcb-3", name: "Rajat Patidar", role: "BAT", teamId: "RCB", photoUrl: "/players/rcb-3.png", credits: 8.0, recentForm: form([40, 55, 30, 65, 35], { runsScored: 45 }) },
    { id: "rcb-4", name: "Glenn Maxwell", role: "AR", teamId: "RCB", photoUrl: "/players/rcb-4.png", credits: 8.5, recentForm: form([45, 30, 55, 40, 60], { runsScored: 35, wicketsTaken: 1 }) },
    { id: "rcb-5", name: "Cameron Green", role: "AR", teamId: "RCB", photoUrl: "/players/rcb-5.png", credits: 8.0, recentForm: form([35, 45, 25, 50, 30], { runsScored: 32, wicketsTaken: 1 }) },
    { id: "rcb-6", name: "Dinesh Karthik", role: "WK", teamId: "RCB", photoUrl: "/players/rcb-6.png", credits: 7.5, recentForm: form([25, 40, 55, 20, 35], { runsScored: 30 }) },
    { id: "rcb-7", name: "Mohammed Siraj", role: "BOWL", teamId: "RCB", photoUrl: "/players/rcb-7.png", credits: 8.5, recentForm: form([40, 55, 30, 45, 60], { wicketsTaken: 2 }) },
    { id: "rcb-8", name: "Yash Dayal", role: "BOWL", teamId: "RCB", photoUrl: "/players/rcb-8.png", credits: 7.0, recentForm: form([20, 35, 45, 25, 30], { wicketsTaken: 1 }) },
    { id: "rcb-9", name: "Karn Sharma", role: "BOWL", teamId: "RCB", photoUrl: "/players/rcb-9.png", credits: 7.0, recentForm: form([25, 30, 20, 40, 35], { wicketsTaken: 2 }) },
    { id: "rcb-10", name: "Wanindu Hasaranga", role: "AR", teamId: "RCB", photoUrl: "/players/rcb-10.png", credits: 8.0, recentForm: form([45, 60, 35, 50, 40], { runsScored: 10, wicketsTaken: 2 }) },
    { id: "rcb-11", name: "Anuj Rawat", role: "WK", teamId: "RCB", photoUrl: "/players/rcb-11.png", credits: 7.0, recentForm: form([20, 25, 15, 30, 22], { runsScored: 20 }) },
    { id: "rcb-12", name: "Reece Topley", role: "BOWL", teamId: "RCB", photoUrl: "/players/rcb-12.png", credits: 7.5, recentForm: form([30, 45, 25, 35, 40], { wicketsTaken: 2 }) },
  ],
  KKR: [
    { id: "kkr-1", name: "Shreyas Iyer", role: "BAT", teamId: "KKR", photoUrl: "/players/kkr-1.png", credits: 8.5, recentForm: form([50, 60, 30, 45, 55], { runsScored: 48 }) },
    { id: "kkr-2", name: "Phil Salt", role: "WK", teamId: "KKR", photoUrl: "/players/kkr-2.png", credits: 8.5, recentForm: form([70, 40, 55, 30, 65], { runsScored: 52 }) },
    { id: "kkr-3", name: "Rinku Singh", role: "BAT", teamId: "KKR", photoUrl: "/players/kkr-3.png", credits: 8.0, recentForm: form([45, 55, 35, 60, 40], { runsScored: 47 }) },
    { id: "kkr-4", name: "Andre Russell", role: "AR", teamId: "KKR", photoUrl: "/players/kkr-4.png", credits: 9.0, recentForm: form([60, 75, 40, 55, 65], { runsScored: 35, wicketsTaken: 2 }) },
    { id: "kkr-5", name: "Sunil Narine", role: "AR", teamId: "KKR", photoUrl: "/players/kkr-5.png", credits: 8.5, recentForm: form([55, 45, 60, 35, 50], { runsScored: 20, wicketsTaken: 2 }) },
    { id: "kkr-6", name: "Venkatesh Iyer", role: "AR", teamId: "KKR", photoUrl: "/players/kkr-6.png", credits: 7.5, recentForm: form([35, 40, 25, 45, 30], { runsScored: 30, wicketsTaken: 1 }) },
    { id: "kkr-7", name: "Mitchell Starc", role: "BOWL", teamId: "KKR", photoUrl: "/players/kkr-7.png", credits: 8.5, recentForm: form([45, 60, 35, 50, 55], { wicketsTaken: 2 }) },
    { id: "kkr-8", name: "Varun Chakravarthy", role: "BOWL", teamId: "KKR", photoUrl: "/players/kkr-8.png", credits: 8.0, recentForm: form([40, 55, 30, 65, 45], { wicketsTaken: 3 }) },
    { id: "kkr-9", name: "Harshit Rana", role: "BOWL", teamId: "KKR", photoUrl: "/players/kkr-9.png", credits: 7.0, recentForm: form([25, 35, 40, 20, 30], { wicketsTaken: 1 }) },
    { id: "kkr-10", name: "Vaibhav Arora", role: "BOWL", teamId: "KKR", photoUrl: "/players/kkr-10.png", credits: 7.0, recentForm: form([20, 30, 25, 35, 22], { wicketsTaken: 1 }) },
    { id: "kkr-11", name: "Angkrish Raghuvanshi", role: "BAT", teamId: "KKR", photoUrl: "/players/kkr-11.png", credits: 7.0, recentForm: form([22, 28, 18, 35, 25], { runsScored: 25 }) },
    { id: "kkr-12", name: "Ramandeep Singh", role: "AR", teamId: "KKR", photoUrl: "/players/kkr-12.png", credits: 7.0, recentForm: form([25, 20, 35, 22, 30], { runsScored: 20, wicketsTaken: 0 }) },
  ],
};

function teamForm(results: Array<TeamFormEntry["result"]>, opponents: string[]): TeamFormEntry[] {
  return results.map((result, i) => ({
    date: new Date(Date.now() - (5 - i) * 4 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    opponent: opponents[i],
    result,
  }));
}

export const MOCK_TEAM_FORM: Record<string, TeamFormEntry[]> = {
  MI: teamForm(["W", "L", "W", "W", "L"], ["KKR", "RCB", "CSK", "SRH", "GT"]),
  CSK: teamForm(["L", "W", "W", "L", "W"], ["MI", "PBKS", "LSG", "RR", "DC"]),
  RCB: teamForm(["W", "W", "L", "W", "W"], ["KKR", "MI", "CSK", "SRH", "GT"]),
  KKR: teamForm(["L", "W", "W", "W", "L"], ["RCB", "DC", "RR", "PBKS", "LSG"]),
};

/**
 * Built fresh on every call (not a module-level constant) so `startTime`
 * stays "N days from now" for as long as the dev server keeps running,
 * instead of freezing at whatever moment the module was first imported
 * and silently drifting into the past.
 */
export function getMockMatches(): UpcomingMatch[] {
  return [
    {
      id: "match-1",
      format: "T20",
      startTime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      status: "upcoming",
      teamA: MOCK_TEAMS.MI,
      teamB: MOCK_TEAMS.CSK,
      venueId: "venue-wankhede",
      venueName: "Wankhede Stadium, Mumbai",
    },
    {
      id: "match-2",
      format: "T20",
      startTime: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(),
      status: "upcoming",
      teamA: MOCK_TEAMS.RCB,
      teamB: MOCK_TEAMS.KKR,
      venueId: "venue-chinnaswamy",
      venueName: "M. Chinnaswamy Stadium, Bengaluru",
    },
    {
      id: "match-3",
      format: "T20",
      startTime: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
      status: "upcoming",
      teamA: MOCK_TEAMS.CSK,
      teamB: MOCK_TEAMS.RCB,
      venueId: "venue-chepauk",
      venueName: "M. A. Chidambaram Stadium, Chennai",
    },
  ];
}

export const MOCK_HEAD_TO_HEAD: HeadToHeadRecord[] = [
  {
    teamAId: "MI",
    teamBId: "CSK",
    lastMeetings: [
      { date: "2025-05-11", winnerTeamId: "MI", venue: "Wankhede Stadium, Mumbai" },
      { date: "2024-04-21", winnerTeamId: "CSK", venue: "M. A. Chidambaram Stadium, Chennai" },
      { date: "2023-05-06", winnerTeamId: "CSK", venue: "Wankhede Stadium, Mumbai" },
      { date: "2022-04-24", winnerTeamId: "MI", venue: "Dr DY Patil Sports Academy" },
      { date: "2021-04-10", winnerTeamId: "CSK", venue: "Wankhede Stadium, Mumbai" },
    ],
  },
  {
    teamAId: "RCB",
    teamBId: "KKR",
    lastMeetings: [
      { date: "2025-04-15", winnerTeamId: "RCB", venue: "M. Chinnaswamy Stadium, Bengaluru" },
      { date: "2024-03-22", winnerTeamId: "KKR", venue: "Eden Gardens, Kolkata" },
      { date: "2023-05-01", winnerTeamId: "RCB", venue: "M. Chinnaswamy Stadium, Bengaluru" },
      { date: "2022-04-09", winnerTeamId: "KKR", venue: "Eden Gardens, Kolkata" },
      { date: "2021-04-19", winnerTeamId: "KKR", venue: "Wankhede Stadium, Mumbai" },
    ],
  },
  {
    teamAId: "CSK",
    teamBId: "RCB",
    lastMeetings: [
      { date: "2025-04-02", winnerTeamId: "CSK", venue: "M. A. Chidambaram Stadium, Chennai" },
      { date: "2024-05-04", winnerTeamId: "RCB", venue: "M. Chinnaswamy Stadium, Bengaluru" },
      { date: "2023-04-08", winnerTeamId: "CSK", venue: "M. A. Chidambaram Stadium, Chennai" },
      { date: "2022-05-03", winnerTeamId: "CSK", venue: "Wankhede Stadium, Mumbai" },
      { date: "2021-04-25", winnerTeamId: "RCB", venue: "Wankhede Stadium, Mumbai" },
    ],
  },
];
