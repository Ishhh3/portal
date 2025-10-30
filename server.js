const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
  host: "bgin1sgtb6py8ftcal3a-mysql.services.clever-cloud.com",
  user: "uvq8dh6p8eyfn7nk",
  password: "8m2keiGr8WlV3HkAu7cC",
  database: "bgin1sgtb6py8ftcal3a",
});

db.connect((err) => {
  if (err) throw err;
  console.log("Connected to MySQL database");
});

app.get("/api/members", (req, res) => {
  db.query("SELECT * FROM accounts", (err, rows) => {
    if (err) throw err;
    res.json(rows);
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  console.log("\n=== Login Attempt ===");
  console.log("Username:", username);

  const studentQuery = "SELECT student_id AS username, password_hash, 'student' AS role FROM accounts WHERE student_id = ?";
  db.query(studentQuery, [username], (err, studentResults) => {
    if (err) {
      console.error("Student query error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }

    if (studentResults.length > 0) {
      const student = studentResults[0];
      console.log("Found student account");
      if (password === student.password_hash) {
        console.log("Student login successful");
        return res.json({
          success: true,
          role: "student",
          username: student.username,
          student_id: student.username,
        });
      } else {
        console.log("Student password incorrect");
        return res.status(400).json({ success: false, message: "Invalid password" });
      }
    }

    const teacherQuery = `
      SELECT ta.name_teacher AS username, ta.password_hash, 
             'teacher' AS role, t.teacher_id, t.teacherUser_id 
      FROM teacher_accounts ta
      JOIN teachers t ON ta.teacher_id = t.teacher_id
      WHERE ta.name_teacher = ?
    `;

    db.query(teacherQuery, [username], (err, teacherResults) => {
      if (err) {
        console.error("Teacher query error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
      }

      if (teacherResults.length > 0) {
        const teacher = teacherResults[0];
        console.log("Found teacher account");
        console.log("Teacher login data:", teacher);
        
        if (password === teacher.password_hash) {
          console.log("Teacher login successful");
          return res.json({
            success: true,
            role: "teacher",
            username: teacher.username,
            teacher_id: teacher.teacher_id,
            teacherUser_id: teacher.teacherUser_id,
          });
        } else {
          console.log("Teacher password incorrect");
          return res.status(400).json({ success: false, message: "Invalid password" });
        }
      }

      const adminQuery = `
        SELECT admin_id, username, password_hash, full_name, email, phone, 'admin' AS role
        FROM admin_accounts
        WHERE username = ?
      `;

      db.query(adminQuery, [username], (err, adminResults) => {
        if (err) {
          console.error("Admin query error:", err);
          return res.status(500).json({ success: false, message: "Server error" });
        }

        if (adminResults.length > 0) {
          const admin = adminResults[0];
          console.log("Found admin account");
          console.log("Admin login data:", admin);

          if (password === admin.password_hash) {
            console.log("Admin login successful");
            return res.json({
              success: true,
              role: "admin",
              username: admin.username,
              admin_id: admin.admin_id,
              full_name: admin.full_name,
              email: admin.email,
              phone: admin.phone,
            });
          } else {
            console.log("Admin password incorrect");
            return res.status(400).json({ success: false, message: "Invalid password" });
          }
        }

        console.log("User not found in any account type");
        return res.status(404).json({ success: false, message: "User not found" });
      });
    });
  });
});

app.get("/student/dashboard/:student_id", (req, res) => {
  const student_id = req.params.student_id;

  const selectQuery = `
    SELECT 
      a.student_id, 
      CONCAT(s.first_name, ' ', s.middle_name, '. ', s.last_name) AS full_name, 
      c.course_name AS course, 
      y.year_level_name AS year_level, 
      AVG(g.final_grade) AS average_final 
    FROM accounts a
    JOIN students s ON a.studentUser_id = s.studentUser_id 
    JOIN courses c ON s.course_id = c.course_id 
    JOIN year_levels y ON s.year_level_id = y.year_level_id 
    JOIN grades g ON s.studentUser_id = g.studentUser_id 
    WHERE a.student_id = ? 
    GROUP BY a.student_id, full_name, c.course_name, y.year_level_name;
  `;

  db.query(selectQuery, [student_id], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(rows[0]);
  });
});

app.get("/teacher/dashboard/:teacher_id", (req, res) => {
  const teacher_id = req.params.teacher_id;
  
  console.log("Fetching dashboard for teacher_id:", teacher_id);

  const selectQuery = `
    SELECT 
      t.teacher_id,
      t.teacherUser_id,
      CONCAT(t.first_name, ' ', t.middle_name, '. ', t.last_name) AS full_name,
      d.department_name,
      '2024-2025' as academic_year
    FROM teachers t
    JOIN departments d ON t.department_id = d.department_id
    LEFT JOIN teacher_accounts ta ON t.teacher_id = ta.teacher_id
    WHERE t.teacher_id = ?
    LIMIT 1;
  `;

  db.query(selectQuery, [teacher_id], (err, rows) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (rows.length === 0) {
      console.log("Teacher not found for ID:", teacher_id);
      return res.status(404).json({ error: "Teacher not found" });
    }
    console.log("Teacher dashboard data:", rows[0]);
    res.json(rows[0]);
  });
});

app.get("/teacher/stats/:teacher_id", (req, res) => {
  const teacher_id = req.params.teacher_id;
  
  console.log("Fetching stats for teacher_id:", teacher_id);

  const statsQuery = `
    SELECT 
      (SELECT COUNT(DISTINCT ss.studentUser_id) 
       FROM student_subject ss 
       WHERE ss.teacher_id = ?) as total_classes,
      
      (SELECT COUNT(DISTINCT hs.subject_id) 
       FROM handle_subject hs 
       WHERE hs.teacher_id = ?) as total_subjects,
      
      (SELECT COUNT(*) 
       FROM grades g 
       WHERE g.teacher_id = ? 
       AND (g.midterm_grade IS NULL OR g.final_grade IS NULL)) as pending_grades,
      
      0 as announcements
  `;

  db.query(statsQuery, [teacher_id, teacher_id, teacher_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    console.log("Teacher stats:", results[0]);
    res.json(results[0]);
  });
});

app.get("/admin/dashboard/:admin_id", (req, res) => {
  const admin_id = req.params.admin_id;
  
  console.log("Fetching dashboard for admin_id:", admin_id);

  const selectQuery = `
    SELECT 
      admin_id,
      username,
      full_name,
      email,
      phone,
      created_at
    FROM admin_accounts
    WHERE admin_id = ?
    LIMIT 1;
  `;

  db.query(selectQuery, [admin_id], (err, rows) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (rows.length === 0) {
      console.log("Admin not found for ID:", admin_id);
      return res.status(404).json({ error: "Admin not found" });
    }
    console.log("Admin dashboard data:", rows[0]);
    res.json(rows[0]);
  });
});

app.get("/student/grades/:student_id", (req, res) => {
  const student_id = req.params.student_id;

  console.log("Fetching grades for student_id:", student_id);

  const query = `
    SELECT 
      g.grade_id,
      sub.subject_code,
      sub.subject_name,
      CONCAT(t.first_name, ' ', t.middle_name, '. ', t.last_name) AS teacher,
      g.midterm_grade,
      g.final_grade,
      g.academic_year,
      g.semester
    FROM grades g
    JOIN accounts a ON g.studentUser_id = a.studentUser_id
    JOIN subjects sub ON g.subject_id = sub.subject_id
    JOIN teachers t ON g.teacher_id = t.teacher_id
    WHERE a.student_id = ?
    ORDER BY g.academic_year DESC, g.semester DESC;
  `;

  db.query(query, [student_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Grades fetched:", results.length);
    res.json(results);
  });
});

app.get("/teacher/students/:teacher_id", (req, res) => {
  const teacher_id = req.params.teacher_id;

  console.log("Fetching students for teacher_id:", teacher_id);

  const query = `
    SELECT DISTINCT
      s.studentUser_id,
      CONCAT(s.first_name, ' ', s.middle_name, '. ', s.last_name) AS student_name,
      a.student_id,
      c.course_name,
      y.year_level_name,
      s.email,
      s.phone
    FROM student_subject ss
    JOIN students s ON ss.studentUser_id = s.studentUser_id
    JOIN accounts a ON s.studentUser_id = a.studentUser_id
    JOIN courses c ON s.course_id = c.course_id
    JOIN year_levels y ON s.year_level_id = y.year_level_id
    WHERE ss.teacher_id = ?
    ORDER BY s.last_name, s.first_name;
  `;

  db.query(query, [teacher_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Students fetched:", results.length);
    res.json(results);
  });
});

app.get("/teacher/subjects/:teacher_id", (req, res) => {
  const teacher_id = req.params.teacher_id;

  console.log("Fetching subjects for teacher_id:", teacher_id);

  const query = `
    SELECT DISTINCT
      sub.subject_id,
      sub.subject_code,
      sub.subject_name,
      c.course_name
    FROM handle_subject hs
    JOIN subjects sub ON hs.subject_id = sub.subject_id
    JOIN courses c ON sub.course_id = c.course_id
    WHERE hs.teacher_id = ?
    ORDER BY sub.subject_code;
  `;

  db.query(query, [teacher_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Subjects fetched:", results.length);
    res.json(results);
  });
});

app.get("/teacher/grades/:teacher_id", (req, res) => {
  const teacher_id = req.params.teacher_id;
  const { subject_id, academic_year, semester } = req.query;

  console.log("Fetching grades for teacher_id:", teacher_id);
  console.log("Filters - subject_id:", subject_id, "academic_year:", academic_year, "semester:", semester);

  let query = `
    SELECT 
      g.grade_id,
      g.studentUser_id,
      CONCAT(s.first_name, ' ', s.middle_name, '. ', s.last_name) AS student_name,
      a.student_id,
      sub.subject_code,
      sub.subject_name,
      g.midterm_grade,
      g.final_grade,
      g.academic_year,
      g.semester
    FROM grades g
    JOIN students s ON g.studentUser_id = s.studentUser_id
    JOIN accounts a ON s.studentUser_id = a.studentUser_id
    JOIN subjects sub ON g.subject_id = sub.subject_id
    WHERE g.teacher_id = ?
  `;

  const queryParams = [teacher_id];

  if (subject_id) {
    query += " AND g.subject_id = ?";
    queryParams.push(subject_id);
  }

  if (academic_year) {
    query += " AND g.academic_year = ?";
    queryParams.push(academic_year);
  }

  if (semester) {
    query += " AND g.semester = ?";
    queryParams.push(semester);
  }

  query += " ORDER BY s.last_name, s.first_name, sub.subject_code";

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Grades fetched:", results.length);
    res.json(results);
  });
});

app.put("/teacher/grades/:grade_id", (req, res) => {
  const grade_id = req.params.grade_id;
  const { midterm_grade, final_grade } = req.body;

  console.log("Updating grade_id:", grade_id);
  console.log("New values - midterm:", midterm_grade, "final:", final_grade);

  const query = `
    UPDATE grades 
    SET midterm_grade = ?, final_grade = ?
    WHERE grade_id = ?
  `;

  db.query(query, [midterm_grade, final_grade, grade_id], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Grade not found" });
    }

    console.log("Grade updated successfully");
    res.json({ success: true, message: "Grade updated successfully" });
  });
});

app.post("/teacher/grades/bulk-update", (req, res) => {
  const { grades } = req.body;

  if (!grades || !Array.isArray(grades) || grades.length === 0) {
    return res.status(400).json({ success: false, message: "Invalid grades data" });
  }

  console.log("Bulk updating", grades.length, "grades");

  let completed = 0;
  let errors = [];

  grades.forEach((gradeData, index) => {
    const { studentUser_id, subject_id, teacher_id, midterm_grade, final_grade, academic_year, semester } = gradeData;

    const checkQuery = `
      SELECT grade_id FROM grades 
      WHERE studentUser_id = ? AND subject_id = ? AND teacher_id = ? AND academic_year = ? AND semester = ?
    `;

    db.query(checkQuery, [studentUser_id, subject_id, teacher_id, academic_year, semester], (err, results) => {
      if (err) {
        errors.push({ index, error: err.message });
        completed++;
        if (completed === grades.length) {
          sendBulkResponse();
        }
        return;
      }

      if (results.length > 0) {
        const updateQuery = `
          UPDATE grades 
          SET midterm_grade = ?, final_grade = ? 
          WHERE grade_id = ?
        `;

        db.query(
          updateQuery,
          [midterm_grade, final_grade, results[0].grade_id],
          (err) => {
            if (err) errors.push({ index, error: err.message });
            completed++;
            if (completed === grades.length) {
              sendBulkResponse();
            }
          }
        );
      } else {
        const insertQuery = `
          INSERT INTO grades (studentUser_id, subject_id, teacher_id, midterm_grade, final_grade, academic_year, semester)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertQuery,
          [studentUser_id, subject_id, teacher_id, midterm_grade, final_grade, academic_year, semester],
          (err) => {
            if (err) errors.push({ index, error: err.message });
            completed++;
            if (completed === grades.length) {
              sendBulkResponse();
            }
          }
        );
      }
    });
  });

  function sendBulkResponse() {
    if (errors.length > 0) {
      res.status(207).json({ 
        success: false, 
        message: "Some grades failed to update",
        errors: errors,
        successCount: grades.length - errors.length
      });
    } else {
      res.json({ 
        success: true, 
        message: "All grades updated successfully",
        successCount: grades.length
      });
    }
  }
});

app.get("/api/test-teacher-account/:username", (req, res) => {
  const username = req.params.username;
  
  console.log("\n=== Testing Teacher Account ===");
  console.log("Looking for username:", username);
  
  const query = "SELECT * FROM teacher_accounts WHERE name_teacher = ?";
  
  db.query(query, [username], (err, results) => {
    if (err) {
      console.error("Database Error:", err);
      return res.status(500).json({ 
        success: false, 
        error: err.message,
        sqlMessage: err.sqlMessage 
      });
    }
    
    console.log("Query executed successfully");
    console.log("Results found:", results.length);
    
    if (results.length > 0) {
      const account = results[0];
      console.log("Account found:");
      console.log("  - account_id:", account.account_id);
      console.log("  - teacher_id:", account.teacher_id);
      console.log("  - name_teacher:", account.name_teacher);
      console.log("  - password_hash:", account.password_hash);
      
      return res.json({
        success: true,
        found: true,
        account: {
          account_id: account.account_id,
          teacher_id: account.teacher_id,
          name_teacher: account.name_teacher,
          password_length: account.password_hash ? account.password_hash.length : 0,
          has_password: !!account.password_hash
        }
      });
    } else {
      console.log("No account found with username:", username);
      
      const similarQuery = "SELECT name_teacher FROM teacher_accounts WHERE name_teacher LIKE ?";
      db.query(similarQuery, [`%${username}%`], (err2, similar) => {
        if (err2) {
          return res.json({
            success: true,
            found: false,
            similar: []
          });
        }
        
        console.log("Similar usernames:", similar.map(s => s.name_teacher));
        
        return res.json({
          success: true,
          found: false,
          message: "Account not found",
          similar: similar.map(s => s.name_teacher)
        });
      });
    }
  });
});

app.put("/api/change-password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  const query = "SELECT * FROM accounts WHERE student_id = ?";
  db.query(query, [username], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Server error" });

    if (results.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid username" });
    }

    const user = results[0];

    if (oldPassword !== user.password_hash) {
      return res.status(400).json({ success: false, message: "Invalid old password" });
    }

    const updateQuery = "UPDATE accounts SET password_hash = ? WHERE student_id = ?";
    db.query(updateQuery, [newPassword, username], (err) => {
      if (err) return res.status(500).json({ success: false, message: "Update failed" });

      return res.json({ success: true, message: "Password changed successfully" });
    });
  });
});

app.put("/api/change-password-teacher", (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  console.log("\n=== Teacher Password Change Request ===");
  console.log("Username:", username);
  console.log("Old Password:", oldPassword ? "Provided" : "Missing");
  console.log("New Password:", newPassword ? "Provided" : "Missing");

  const query = "SELECT * FROM teacher_accounts WHERE name_teacher = ?";
  db.query(query, [username], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res.status(500).json({ success: false, message: "Server error: " + err.message });
    }

    console.log("Query results:", results.length, "record(s) found");

    if (results.length === 0) {
      console.log("Teacher not found with username:", username);
      return res.status(400).json({ success: false, message: "Invalid username" });
    }

    const teacher = results[0];
    console.log("Found teacher:", teacher.name_teacher);
    console.log("Stored password hash:", teacher.password_hash);

    if (oldPassword !== teacher.password_hash) {
      console.log("Password mismatch - Old password incorrect");
      return res.status(400).json({ success: false, message: "Invalid old password" });
    }

    console.log("Old password verified, updating to new password");

    const updateQuery = "UPDATE teacher_accounts SET password_hash = ? WHERE name_teacher = ?";
    db.query(updateQuery, [newPassword, username], (err, result) => {
      if (err) {
        console.error("Update Query Error:", err);
        return res.status(500).json({ success: false, message: "Update failed: " + err.message });
      }

      console.log("Password updated successfully for:", username);
      console.log("Rows affected:", result.affectedRows);
      
      return res.json({ success: true, message: "Password changed successfully" });
    });
  });
});

app.get("/admin/stats/students", (req, res) => {
  const query = "SELECT COUNT(*) as count FROM students";
  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ count: results[0].count });
  });
});

app.get("/admin/stats/teachers", (req, res) => {
  const query = "SELECT COUNT(*) as count FROM teachers";
  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ count: results[0].count });
  });
});

app.get("/admin/stats/subjects", (req, res) => {
  const query = "SELECT COUNT(*) as count FROM subjects";
  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ count: results[0].count });
  });
});

app.get("/admin/stats/departments", (req, res) => {
  const query = "SELECT COUNT(*) as count FROM departments";
  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ count: results[0].count });
  });
});

// Add these endpoints to your server.js file

// Get teacher's classes (subjects with sections)
app.get("/teacher/classes/:teacher_id", (req, res) => {
  const teacher_id = req.params.teacher_id;

  console.log("Fetching classes for teacher_id:", teacher_id);

  const query = `
    SELECT DISTINCT
      hs.handle_id,
      sub.subject_id,
      sub.subject_code,
      sub.subject_name,
      hs.sectionCode,
      COUNT(DISTINCT ss.studentUser_id) as student_count,
      hs.department_id,
      d.department_name,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM grades g 
          WHERE g.subject_id = sub.subject_id 
          AND g.teacher_id = hs.teacher_id
          AND (g.midterm_grade IS NULL OR g.final_grade IS NULL)
        ) THEN 'Pending'
        ELSE 'Completed'
      END as status
    FROM handle_subject hs
    JOIN subjects sub ON hs.subject_id = sub.subject_id
    JOIN departments d ON hs.department_id = d.department_id
    LEFT JOIN student_subject ss ON ss.subject_id = sub.subject_id 
      AND ss.teacher_id = hs.teacher_id 
      AND ss.sectionCode = hs.sectionCode
    WHERE hs.teacher_id = ?
    GROUP BY hs.handle_id, sub.subject_id, sub.subject_code, sub.subject_name, 
             hs.sectionCode, hs.department_id, d.department_name
    ORDER BY sub.subject_name, hs.sectionCode;
  `;

  db.query(query, [teacher_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Classes fetched:", results.length);
    res.json(results);
  });
});

app.get("/teacher/subject/:subject_id/sections/:teacher_id", (req, res) => {
  const { subject_id, teacher_id } = req.params;

  console.log("Fetching sections for subject_id:", subject_id, "teacher_id:", teacher_id);

  const query = `
    SELECT DISTINCT
      hs.sectionCode,
      MAX(y.year_level_name) as year_level_name,
      COUNT(DISTINCT ss.studentUser_id) as student_count
    FROM handle_subject hs
    LEFT JOIN student_subject ss ON ss.subject_id = hs.subject_id 
      AND ss.teacher_id = hs.teacher_id 
      AND ss.sectionCode = hs.sectionCode
    LEFT JOIN students st ON st.studentUser_id = ss.studentUser_id
    LEFT JOIN year_levels y ON y.year_level_id = st.year_level_id
    WHERE hs.subject_id = ? AND hs.teacher_id = ?
    GROUP BY hs.sectionCode
    ORDER BY hs.sectionCode;
  `;

  db.query(query, [subject_id, teacher_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Sections fetched:", results.length);
    res.json(results);
  });
});

app.get("/teacher/section-grades/:teacher_id/:subject_id/:section_code", (req, res) => {
  const { teacher_id, subject_id, section_code } = req.params;

  console.log("Fetching grades for teacher:", teacher_id, "subject:", subject_id, "section:", section_code);

  const query = `
    SELECT 
      ss.studentUser_id,
      a.student_id,
      CONCAT(st.first_name, ' ', st.middle_name, '. ', st.last_name) AS student_name,
      g.grade_id,
      g.midterm_grade,
      g.final_grade,
      y.year_level_name
    FROM student_subject ss
    JOIN students st ON st.studentUser_id = ss.studentUser_id
    JOIN accounts a ON a.studentUser_id = ss.studentUser_id
    JOIN year_levels y ON y.year_level_id = st.year_level_id
    LEFT JOIN grades g ON g.studentUser_id = ss.studentUser_id 
      AND g.subject_id = ss.subject_id 
      AND g.teacher_id = ss.teacher_id
    WHERE ss.teacher_id = ? 
      AND ss.subject_id = ? 
      AND ss.sectionCode = ?
    ORDER BY st.last_name, st.first_name;
  `;

  db.query(query, [teacher_id, subject_id, section_code], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Students with grades fetched:", results.length);
    res.json(results);
  });
});


app.get("/admin/students", (req, res) => {
  console.log("Fetching all students");

  const query = `
    SELECT 
      a.student_id,
      CONCAT(s.first_name, ' ', s.middle_name, '. ', s.last_name) AS full_name,
      c.course_name,
      y.year_level_name,
      s.email,
      s.phone,
      s.gender,
      s.birthdate
    FROM students s
    JOIN accounts a ON s.studentUser_id = a.studentUser_id
    JOIN courses c ON s.course_id = c.course_id
    JOIN year_levels y ON s.year_level_id = y.year_level_id
    ORDER BY a.student_id;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Students fetched:", results.length);
    res.json(results);
  });
});


app.get("/admin/teachers", (req, res) => {
  console.log("Fetching all teachers for admin");

  const query = `
    SELECT 
      t.teacher_id,
      t.teacherUser_id,
      CONCAT(t.first_name, ' ', t.middle_name, '. ', t.last_name) AS full_name,
      t.email,
      t.phone,
      d.department_name,
      d.department_id,
      t.encode,
      t.final_encoding,
      ta.archive
    FROM teachers t
    JOIN departments d ON t.department_id = d.department_id
    LEFT JOIN teacher_accounts ta ON t.teacher_id = ta.teacher_id
    ORDER BY t.teacherUser_id;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Teachers fetched:", results.length);
    res.json(results);
  });
});

app.get("/admin/departments", (req, res) => {
  console.log("Fetching all departments");

  const query = "SELECT department_id, department_name FROM departments ORDER BY department_name";

  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Departments fetched:", results.length);
    res.json(results);
  });
});

app.get("/admin/teacher-classes/:teacher_id", (req, res) => {
  const teacher_id = req.params.teacher_id;
  console.log("Fetching classes for teacher_id:", teacher_id);

  const query = `
    SELECT DISTINCT
      hs.handle_id,
      sub.subject_id,
      sub.subject_code,
      sub.subject_name,
      hs.sectionCode,
      COUNT(DISTINCT ss.studentUser_id) as student_count,
      d.department_name
    FROM handle_subject hs
    JOIN subjects sub ON hs.subject_id = sub.subject_id
    JOIN departments d ON hs.department_id = d.department_id
    LEFT JOIN student_subject ss ON ss.subject_id = sub.subject_id 
      AND ss.teacher_id = hs.teacher_id 
      AND ss.sectionCode = hs.sectionCode
    WHERE hs.teacher_id = ?
    GROUP BY hs.handle_id, sub.subject_id, sub.subject_code, 
             sub.subject_name, hs.sectionCode, d.department_name
    ORDER BY sub.subject_name, hs.sectionCode;
  `;

  db.query(query, [teacher_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Classes fetched for teacher:", results.length);
    res.json(results);
  });
});

app.get("/admin/class-students/:teacher_id/:subject_id/:section_code", (req, res) => {
  const { teacher_id, subject_id, section_code } = req.params;
  console.log("Fetching students for class:", { teacher_id, subject_id, section_code });

  const query = `
    SELECT 
      ss.studentUser_id,
      a.student_id,
      CONCAT(st.first_name, ' ', st.middle_name, '. ', st.last_name) AS student_name,
      y.year_level_name,
      g.midterm_grade,
      g.final_grade
    FROM student_subject ss
    JOIN students st ON st.studentUser_id = ss.studentUser_id
    JOIN accounts a ON a.studentUser_id = ss.studentUser_id
    JOIN year_levels y ON y.year_level_id = st.year_level_id
    LEFT JOIN grades g ON g.studentUser_id = ss.studentUser_id 
      AND g.subject_id = ss.subject_id 
      AND g.teacher_id = ss.teacher_id
    WHERE ss.teacher_id = ? 
      AND ss.subject_id = ? 
      AND ss.sectionCode = ?
    ORDER BY st.last_name, st.first_name;
  `;

  db.query(query, [teacher_id, subject_id, section_code], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Students fetched:", results.length);
    res.json(results);
  });
});

app.put("/admin/toggle-encoding", (req, res) => {
  const { teacherId, enabled, encodingType } = req.body;
  console.log("Toggle encoding for teacher:", teacherId, "type:", encodingType, "enabled:", enabled);

  const encodeValue = enabled ? 'on' : 'off';
  const column = encodingType === 'midterm' ? 'encode' : 'final_encoding';
  const query = `UPDATE teachers SET ${column} = ? WHERE teacher_id = ?`;

  db.query(query, [encodeValue, teacherId], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    res.json({ 
      success: true, 
      message: `${encodingType} encoding ${enabled ? 'enabled' : 'disabled'} for teacher ${teacherId}`,
      teacherId,
      encodingType,
      enabled
    });
  });
});

app.put("/admin/toggle-encoding-bulk", (req, res) => {
  const { teacherIds, enabled, encodingType } = req.body;
  console.log("Bulk toggle encoding for teachers:", teacherIds.length, "type:", encodingType, "enabled:", enabled);

  const encodeValue = enabled ? 'on' : 'off';
  const column = encodingType === 'midterm' ? 'encode' : 'final_encoding';
  const query = `UPDATE teachers SET ${column} = ? WHERE teacher_id IN (?)`;

  db.query(query, [encodeValue, teacherIds], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    res.json({ 
      success: true, 
      message: `${encodingType} encoding ${enabled ? 'enabled' : 'disabled'} for ${teacherIds.length} teachers`,
      updated: teacherIds.length
    });
  });
});


app.put("/admin/archive-teacher", (req, res) => {
  const { teacherId } = req.body;
  console.log("Archive teacher:", teacherId);

  const query = "UPDATE teacher_accounts SET archive = 'on' WHERE teacher_id = ?";

  db.query(query, [teacherId], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    res.json({ 
      success: true, 
      message: `Teacher ${teacherId} archived successfully`
    });
  });
});


app.put("/admin/unarchive-teacher", (req, res) => {
  const { teacherId } = req.body;
  console.log("Unarchive teacher:", teacherId);

  const query = "UPDATE teacher_accounts SET archive = 'off' WHERE teacher_id = ?";

  db.query(query, [teacherId], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    res.json({ 
      success: true, 
      message: `Teacher ${teacherId} unarchived successfully`
    });
  });
});

app.get("/api/announcements", (req, res) => {
  const query = "SELECT * FROM announcements ORDER BY date_published DESC, id DESC";
  
  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

app.post("/api/announcements", (req, res) => {
  const { title, content, category, date_published } = req.body;
  
  if (!title || !content || !category || !date_published) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = "INSERT INTO announcements (title, content, category, date_published) VALUES (?, ?, ?, ?)";
  
  db.query(query, [title, content, category, date_published], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json({ 
      success: true, 
      id: result.insertId,
      message: "Announcement created successfully" 
    });
  });
});

app.put("/api/announcements/:id", (req, res) => {
  const { id } = req.params;
  const { title, content, category, date_published } = req.body;
  
  if (!title || !content || !category || !date_published) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const query = "UPDATE announcements SET title = ?, content = ?, category = ?, date_published = ? WHERE id = ?";
  
  db.query(query, [title, content, category, date_published, id], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    
    res.json({ 
      success: true, 
      message: "Announcement updated successfully" 
    });
  });
});

app.delete("/api/announcements/:id", (req, res) => {
  const { id } = req.params;
  
  const query = "DELETE FROM announcements WHERE id = ?";
  
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    
    res.json({ 
      success: true, 
      message: "Announcement deleted successfully" 
    });
  });
});

app.get("/admin/teacher-sections/:teacher_id/:subject_id", (req, res) => {
  const { teacher_id, subject_id } = req.params;
  console.log("Fetching sections for teacher:", teacher_id, "subject:", subject_id);

  const query = `
    SELECT DISTINCT
      hs.sectionCode,
      COUNT(DISTINCT ss.studentUser_id) as student_count
    FROM handle_subject hs
    LEFT JOIN student_subject ss ON ss.subject_id = hs.subject_id 
      AND ss.teacher_id = hs.teacher_id 
      AND ss.sectionCode = hs.sectionCode
    WHERE hs.teacher_id = ? AND hs.subject_id = ?
    GROUP BY hs.sectionCode
    ORDER BY hs.sectionCode;
  `;

  db.query(query, [teacher_id, subject_id], (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    console.log("Sections fetched:", results.length);
    res.json(results);
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.get("/api/leaderboard", (req, res) => {
  const query = `
    SELECT 
      a.student_id,
      CONCAT(s.first_name, ' ', s.middle_name, '. ', s.last_name) AS student_name,
      c.course_name AS department,
      y.year_level_name,
      AVG(g.final_grade) AS gwa,
      '2024-2025' as academic_year
    FROM students s
    JOIN accounts a ON s.studentUser_id = a.studentUser_id
    JOIN courses c ON s.course_id = c.course_id
    JOIN year_levels y ON s.year_level_id = y.year_level_id
    JOIN grades g ON s.studentUser_id = g.studentUser_id
    WHERE g.final_grade IS NOT NULL
    GROUP BY a.student_id, student_name, c.course_name, y.year_level_name
    HAVING AVG(g.final_grade) <= 1.99
    ORDER BY gwa ASC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const leaderboard = results.map((student, index) => {
      const gwa = parseFloat(student.gwa);
      let scholarType = '';
      
      if (gwa >= 1.00 && gwa <= 1.29) {
        scholarType = 'University Scholar';
      } else if (gwa >= 1.3 && gwa <= 1.5) {
        scholarType = 'College Scholar';
      } else if (gwa >= 1.51 && gwa <= 1.75) {
        scholarType = "Dean's Lister";
      }

      return {
        rank: index + 1,
        student_id: student.student_id,
        student_name: student.student_name,
        department: student.department,
        year_level: student.year_level_name,
        gwa: gwa.toFixed(2),
        scholar_type: scholarType,
        academic_year: student.academic_year
      };
    });

    res.json(leaderboard);
  });
});

app.get("/api/leaderboard/departments", (req, res) => {
  const query = "SELECT DISTINCT course_name FROM courses ORDER BY course_name";
  
  db.query(query, (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });

});
