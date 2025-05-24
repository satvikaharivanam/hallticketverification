import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(HallTicketScannerApp());
}

class HallTicketScannerApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hall Ticket Scanner',
      theme: ThemeData(
        primaryColor: Color(0xFF64748B), // slate-500
        scaffoldBackgroundColor: Colors.white,
        textTheme: TextTheme(
          bodyMedium: TextStyle(color: Color(0xFF334155)), // slate-700
          titleLarge: TextStyle(color: Color(0xFF64748B)), // slate-500
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: Color(0xFF64748B), // slate-500
            foregroundColor: Color(0xFF475569), // slate-600 on press
            textStyle: TextStyle(color: Colors.white),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: Color(0xFF64748B), // slate-500
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xFFE2E8F0)), // slate-200
          ),
          enabledBorder: OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xFFE2E8F0)), // slate-200
          ),
          focusedBorder: OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xFFE2E8F0)), // slate-200
          ),
          labelStyle: TextStyle(color: Color(0xFF334155)), // slate-700
        ),
      ),
      home: SubjectSelectorPage(),
    );
  }
}

class SubjectSelectorPage extends StatefulWidget {
  @override
  _SubjectSelectorPageState createState() => _SubjectSelectorPageState();
}

class _SubjectSelectorPageState extends State<SubjectSelectorPage> {
  List<String> subjects = [];
  String? selectedSubject;
  final TextEditingController _subjectController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _fetchSubjects();
  }

  Future<void> _fetchSubjects() async {
    try {
      final response = await http.get(Uri.parse('http://192.168.114.201:5000/api/subjects'));
      if (response.statusCode == 200) {
        setState(() {
          subjects = List<String>.from(json.decode(response.body));
        });
      } else {
        debugPrint('Failed to fetch subjects, status: ${response.statusCode}, body: ${response.body}');
        throw Exception('Failed to load subjects');
      }
    } catch (e) {
      debugPrint('Error fetching subjects: $e');
      setState(() {
        subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology']; // Fallback list
      });
    }
  }

  Future<void> _addSubject() async {
    String newSubject = _subjectController.text.trim();
    if (newSubject.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Please enter a subject name')),
      );
      return;
    }
    try {
      final response = await http.post(
        Uri.parse('http://192.168.114.201:5000/api/subjects'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'subject': newSubject}),
      );
      if (response.statusCode == 201) {
        setState(() {
          if (!subjects.contains(newSubject)) {
            subjects.add(newSubject);
          }
          _subjectController.clear();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Subject added successfully')),
        );
      } else {
        debugPrint('Failed to add subject, status: ${response.statusCode}, body: ${response.body}');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to add subject: ${response.body}')),
        );
      }
    } catch (e) {
      debugPrint('Error adding subject: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error adding subject')),
      );
    }
  }

  Future<void> _deleteSubject(String subject) async {
    if (subject == selectedSubject) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cannot delete the currently selected subject')),
      );
      return;
    }
    try {
      final response = await http.delete(
        Uri.parse('http://192.168.114.201:5000/api/subjects/$subject'),
      );
      if (response.statusCode == 200) {
        setState(() {
          subjects.remove(subject);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Subject deleted successfully')),
        );
      } else {
        debugPrint('Failed to delete subject, status: ${response.statusCode}, body: ${response.body}');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete subject: ${response.body}')),
        );
      }
    } catch (e) {
      debugPrint('Error deleting subject: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error deleting subject')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Select Subject'),
        backgroundColor: Color(0xFF64748B), // slate-500
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Choose the subject to start scanning:',
                style: TextStyle(fontSize: 16, color: Color(0xFF334155)), // slate-700
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 20),
              DropdownButton<String>(
                value: selectedSubject,
                hint: Text('Select a subject', style: TextStyle(color: Color(0xFF334155))), // slate-700
                isExpanded: true,
                onChanged: (value) {
                  setState(() {
                    selectedSubject = value;
                  });
                },
                items: subjects.map((subject) {
                  return DropdownMenuItem<String>(
                    value: subject,
                    child: Container(
                      color: Color(0xFFCBD5E1), // slate-300
                      padding: EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              subject,
                              style: TextStyle(color: Color(0xFF334155)), // slate-700
                            ),
                          ),
                          IconButton(
                            icon: Icon(Icons.delete, size: 20, color: Colors.red),
                            onPressed: () => _deleteSubject(subject),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
                underline: Container(
                  height: 2,
                  color: Color(0xFFE2E8F0), // slate-200
                ),
              ),
              SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _subjectController,
                      decoration: InputDecoration(
                        labelText: 'Add New Subject',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  SizedBox(width: 10),
                  ElevatedButton(
                    onPressed: _addSubject,
                    child: Text('Add'),
                  ),
                ],
              ),
              SizedBox(height: 20),
              ElevatedButton(
                onPressed: selectedSubject == null
                    ? null
                    : () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => QRScannerPage(subject: selectedSubject!),
                          ),
                        );
                      },
                child: Text('Start Scanning'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _subjectController.dispose();
    super.dispose();
  }
}

class QRScannerPage extends StatefulWidget {
  final String subject;

  QRScannerPage({required this.subject});

  @override
  _QRScannerPageState createState() => _QRScannerPageState();
}

class _QRScannerPageState extends State<QRScannerPage> {
  final MobileScannerController _controller = MobileScannerController();
  bool _isScanning = true;

  void _onScan(BarcodeCapture barcodeCapture) async {
    if (!_isScanning || barcodeCapture.barcodes.isEmpty) return;
    setState(() => _isScanning = false);
    await _controller.stop(); // Pause scanner
    debugPrint('📸 QR Code Detected!');
    try {
      final raw = barcodeCapture.barcodes.first.rawValue;
      debugPrint('📦 Raw QR Data: $raw');
      if (raw == null) {
        debugPrint('❌ Raw data is null');
        _showDialog('Error', 'Invalid QR Code');
        return;
      }
      final qrData = json.decode(raw);
      debugPrint('📋 Decoded QR Data: $qrData');
      final rollNumber = qrData['rollNumber'];
      if (rollNumber == null) {
        debugPrint('❌ No rollNumber in QR data');
        _showDialog('Error', 'Invalid QR Code data');
        return;
      }
      debugPrint('🔍 Sending to server: rollNsumber=$rollNumber, subject=${widget.subject}');
      final response = await http.post(
        Uri.parse('http://192.168.114.201:5000/api/mark-attendance'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'rollNumber': rollNumber, 'subject': widget.subject}),
      );
      debugPrint('📡 Server response: ${response.statusCode}, ${response.body}');
      if (response.statusCode == 200) {
        debugPrint('✅ Attendance marked');
        final body = json.decode(response.body);
        final message = body['message'];
        final today = DateTime.now().toIso8601String().split('T')[0];
        _showDialog('Success', '$message\nCSV file created/updated at: /Uploads/${today}_${widget.subject}.csv');
      } else {
        debugPrint('❌ Server error: ${response.statusCode}, ${response.body}');
        _showDialog('Error', 'Server error: ${response.body}');
      }
    } catch (e) {
      debugPrint('❌ Scan error: $e');
      _showDialog('Error', 'Invalid QR or system error.');
    }
  }

  void _showDialog(String title, String message) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: Text(
          title,
          style: TextStyle(color: Color(0xFF64748B)), // slate-500
        ),
        content: SingleChildScrollView(
          child: Text(
            message,
            style: TextStyle(color: Color(0xFF334155)), // slate-700
          ),
        ),
        actions: [
          TextButton(
            child: Text('OK'),
            onPressed: () {
              Navigator.of(dialogContext).pop();
              setState(() {
                _isScanning = true;
                _controller.start(); // Resume scanner
              });
            },
          ),
        ],
      ),
    );
  }

  void _changeSubject() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => SubjectSelectorPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Scanner - ${widget.subject}'),
        backgroundColor: Color(0xFF64748B), // slate-500
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: Icon(Icons.edit, color: Color(0xFFE2E8F0)), // slate-200
            tooltip: 'Change Subject',
            onPressed: _changeSubject,
          ),
        ],
      ),
      body: Center(
        child: MobileScanner(
          controller: _controller,
          onDetect: _onScan,
        ),
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}