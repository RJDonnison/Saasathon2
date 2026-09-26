/** Demo timetable and school records used until schedule, homework and notice APIs exist. */
export const demoTimetable = [
  { time: '9:00', period: 'Period 1', subject: 'Mathematics', teacher: 'Mr Harris', room: 'M2', topic: 'Linear equations, exercise 4.3', status: 'Done' },
  { time: '10:05', period: 'Period 2', subject: 'Digital Technologies', teacher: 'Ms Patel', room: 'D2', topic: 'Loops: page 200, Problems A to D', status: 'Live now' },
  { time: '11:05', period: '', subject: 'Interval', teacher: '', room: '', topic: '', status: '' },
  { time: '11:25', period: 'Period 3', subject: 'English', teacher: 'Ms Wong', room: 'E7', topic: 'Persuasive writing: paragraph structure', status: '' },
  { time: '12:30', period: 'Period 4', subject: 'Science', teacher: 'Mr Brooks', room: 'S3', topic: 'Acids and bases: practical', status: 'Bring your lab book' },
  { time: '1:30', period: '', subject: 'Lunch', teacher: '', room: '', topic: '', status: '' },
  { time: '2:15', period: 'Period 5', subject: 'Physical Education', teacher: 'Mr Reid', room: 'Gym', topic: 'Fitness testing', status: 'Bring PE gear' },
]

export const demoDueItems = [
  { title: 'Loops, Problems C and D', course: 'Digital Technologies', due: 'Tomorrow, 3:00pm', status: 'Started' },
  { title: 'Exercise 4.3, questions 1 to 12', course: 'Mathematics', due: 'Thursday, 9:00am', status: 'Not started' },
  { title: 'Persuasive paragraph, first draft', course: 'English', due: 'Friday, 3:00pm', status: 'Not started' },
  { title: 'Acids practical write-up', course: 'Science', due: 'Friday, 3:15pm', status: 'Not started' },
  { title: 'Reading response: chapter 6', course: 'English', due: 'Monday, 9:00am', status: 'Not started' },
  { title: 'Fitness reflection', course: 'Physical Education', due: 'Monday, 3:00pm', status: 'Not started' },
]

export const demoWeek = [
  { day: 'Monday', lessons: ['English, persuasive devices', 'Science, acids and bases'] },
  { day: 'Tuesday', lessons: ['Mathematics, linear equations', 'Digital Technologies, loops'] },
  { day: 'Wednesday', lessons: ['Mathematics, graphing lines', 'English, paragraph structure'] },
  { day: 'Thursday', lessons: ['Digital Technologies, loops practice', 'Science, practical'] },
  { day: 'Friday', lessons: ['English, peer review', 'Physical Education, fitness'] },
]

export const demoNotices = [
  { course: 'Science', teacher: 'Mr Brooks', message: "Bring your lab book today. You can't join the practical without it." },
  { course: 'Mathematics', teacher: 'Mr Harris', message: 'The algebra test has moved to next Wednesday, Period 1.' },
]

export const demoCourses = [
  { name: 'Digital Technologies', teacher: 'Ms Patel', last: 'Loops, page 200 (today)', next: 'Thursday, Period 3: loops practice', due: '1 item', live: true },
  { name: 'Mathematics', teacher: 'Mr Harris', last: 'Linear equations, exercise 4.3 (today)', next: 'Wednesday, Period 1: graphing lines', due: '1 item' },
  { name: 'English', teacher: 'Ms Wong', last: 'Persuasive devices (Monday)', next: 'Today, Period 3: paragraph structure', due: '1 item' },
  { name: 'Science', teacher: 'Mr Brooks', last: 'Acids and bases (Monday)', next: 'Today, Period 4: practical', due: '1 item' },
  { name: 'Physical Education', teacher: 'Mr Reid', last: 'Fitness and movement (Friday)', next: 'Today, Period 5: fitness testing', due: 'No work due' },
]

export const demoLessonLog = {
  topic: 'Loops: page 200',
  date: 'Tuesday, Period 2',
  steps: ['Recap: while loops', 'Page 200: for loops', 'Problem A', 'Problem B', 'Problem C, set as homework'],
  board: 'for i in range(3):\n    print("Round", i)\n\n# prints Round 0, Round 1, Round 2',
  takeaway: 'range(5) runs five times but counts from 0, so i goes 0, 1, 2, 3, 4.',
}
