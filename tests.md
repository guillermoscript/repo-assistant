# List of Test Cases

this is a list of test cases for the duplicate detection bot. Each test case is a GitHub issue with a title and body. The title and body are designed to test the bot's ability to detect duplicates and similarities. The test cases are grouped into categories based on the type of issue they represent.

1. **Issue 1 - Duplicate**: Two issues with identical titles and bodies.
   - Title: "Duplicate Issue"
   - Body: "This is a duplicate issue. Please mark it as such."

2. **Issue 2 - Similar**: Two issues with similar titles and bodies.
   - Title: "Bug in Login Page"
   - Body: "When I try to log in, the page hangs and doesn't respond."

3. **Issue 3 - Different**: Two issues with different content.
   - Title: "Feature Request: Dark Mode"
   - Body: "It would be great to have a dark mode option in the app."

4. **Issue 4 - Similar Labels**: Two issues with the same labels.
   - Title: "Performance Issue"
   - Body: "The app is running very slowly."

5. **Issue 5 - No Similarity**: Two issues with completely different content.
   - Title: "Documentation Help"
   - Body: "I need assistance with understanding the API documentation."

Please note that these sample issues are meant to demonstrate different scenarios. You can modify the titles, bodies, and labels as needed to fit your specific testing requirements.

### Explanation of Test Cases:
1. **Issue 1**: This pair of issues is designed to be an exact duplicate. The bot should identify them as duplicates and add a comment with the reference to the original issue.
2. **Issue 2**: These issues have similar titles and bodies but are not exact duplicates. The bot should recognize the similarity and provide a relevant response in the comment.
3. **Issue 3**: These issues have different content and should not be flagged as duplicates. The bot should acknowledge the new issue and provide a general response.
4. **Issue 4**: These issues have the same labels. The bot should consider the labels as part of the filtering process and detect the similarity based on the labels.
5. **Issue 5**: These issues have no similarity in their content. The bot should recognize this and provide a generic response indicating that the issue will be addressed.


6. **Issue 6 - Similar Content, Different Context**:
   - Title: "Login Failure on Mobile"
   - Body: "Users are experiencing issues when trying to log in from their mobile devices."

7. **Issue 7 - Duplicate with Typos**:
   - Title: "Duplcate Isssue"
   - Body: "Thiss is a duplcate issue. Plese mark it as such."

8. **Issue 8 - Related but Not Duplicate**:
   - Title: "Password Reset Not Working"
   - Body: "The password reset link seems to be broken, clicking on it gives a 404 error."

9. **Issue 9 - Different Issue with Common Keywords**:
   - Title: "Search Functionality Broken"
   - Body: "The search feature does not return any results, even for queries that used to work."

10. **Issue 10 - Non-Technical Issue**:
    - Title: "Community Guidelines Update"
    - Body: "We need to revise our community guidelines to address new user behaviors."

11. **Issue 11 - Feature Request with Similarity**:
    - Title: "Request for Dark Theme"
    - Body: "A dark theme would be easier on the eyes for night-time users."

12. **Issue 12 - Performance Issue with Different Details**:
    - Title: "Slow Performance on Data Load"
    - Body: "The application slows down significantly when loading large datasets."

13. **Issue 13 - Duplicate in Different Words**:
    - Title: "Application Sluggishness During Data Import"
    - Body: "There's a noticeable lag when importing data into the application."

14. **Issue 14 - False Positive Duplicate**:
    - Title: "Duplicate Records in Database"
    - Body: "Our database has duplicate records after the last data migration."

### Explanation of Test Cases:

6. **Issue 6**: Tests the bot's ability to identify context-specific issues. While similar to Issue 2, the mobile context should not be marked as a duplicate.
7. **Issue 7**: Challenges the bot's duplicate detection with typos. The bot should recognize this as a duplicate of Issue 1 despite the spelling errors.
8. **Issue 8**: Related to login issues (like Issue 2) but focuses on a different functionality. The bot should not mark this as a duplicate.
9. **Issue 9**: Contains common keywords like "broken" but is unrelated to login issues. The bot should recognize it as a separate concern.
10. **Issue 10**: A non-technical, community-related issue that should be treated as a unique case.
11. **Issue 11**: Similar to Issue 3's feature request but with different phrasing. The bot may recognize similarity but should not mark it as a duplicate.
12. **Issue 12**: A performance issue that is different from Issue 4. The bot should differentiate it based on the specific details of the data load.
13. **Issue 13**: Presents a challenge for the bot to recognize rephrased duplicates. It should be identified as similar to Issue 12.
14. **Issue 14**: A potential false positive for duplicate detection. The bot should be cautious and not mark it as a duplicate unless the similarity score is very high.


15. **Issue 15 - Exact Duplicate with Different Reporters**:
    - Title: "Application Crash on Startup"
    - Body: "The application immediately crashes upon launching. No error message is displayed."

16. **Issue 16 - Same Problem, Different Modules**:
    - Title: "Crash on Startup - Reporting Module"
    - Body: "The reporting module crashes on startup. This started happening after the last update."

17. **Issue 17 - Vague Issue Description**:
    - Title: "Something's Not Right"
    - Body: "I'm not sure what's happening, but the application doesn't feel right."

18. **Issue 18 - Technical Question Rather Than Issue**:
    - Title: "How to Implement OAuth 2.0 Authentication?"
    - Body: "I'm trying to add OAuth 2.0 authentication to my application. Could someone guide me through the process?"

19. **Issue 19 - User Experience Feedback**:
    - Title: "User Feedback on New Interface"
    - Body: "The new interface is confusing to our users. Can we consider adding a tutorial or guide?"

### Explanation of Test Cases:

15. **Issue 15**: Designed to test whether the bot can identify duplicates reported by different users. Since the content is the same as Issue 1, it should be flagged as a duplicate.
16. **Issue 16**: Similar to Issue 15, but specifies a particular module. The bot should recognize the similarity but consider the module's context before marking it as a duplicate.
17. **Issue 17**: A vague issue description that might be challenging for the bot to categorize. It should not be marked as a duplicate without clear similarities.
18. **Issue 18**: A question rather than a bug report or feature request. The bot should treat it as a unique issue and possibly provide resources or tag it for human follow-up.
19. **Issue 19**: User experience feedback that is unique and should prompt a different response from the bot, possibly flagging it for UI/UX team attention.



20. **Issue 20 - Border Case: Empty Content**:
    - Title: ""
    - Body: ""

21. **Issue 21 - Border Case: Very Long Issue**:
    - Title: "Extremely Long Issue Title with Many Detailed Descriptions and Edge Case Scenarios"
    - Body: "This issue contains an extremely detailed description that goes on for paragraphs, including stack traces, error messages, and a thorough account of steps to reproduce the problem. It represents a border case where the issue content is much longer than typical issues."

22. **Issue 22 - Context Specific: Database Migration Error**:
    - Title: "Error During Database Migration"
    - Body: "Running the latest migration script causes a unique key constraint violation."

23. **Issue 23 - Simple Duplicate: Repeated Submission**:
    - Title: "Application Crash on Startup"
    - Body: "The application immediately crashes upon launching. No error message is displayed."

24. **Issue 24 - Context Specific: Localization Problem**:
    - Title: "Localization Issue in French Language Pack"
    - Body: "The French translation for the 'Settings' menu item is incorrect."

25. **Issue 25 - Simple Duplicate: Copy-Paste Error Report**:
    - Title: "Search Functionality Broken"
    - Body: "The search feature does not return any results, even for queries that used to work."

26. **Issue 26 - Context Specific: Security Flaw**:
    - Title: "Potential XSS Vulnerability in Comment Section"
    - Body: "User comments are not properly sanitized, allowing for potential cross-site scripting attacks."

27. **Issue 27 - Edge Case: Intermittent Bug**:
    - Title: "Intermittent Crash on Data Export"
    - Body: "The application occasionally crashes when exporting data to CSV, but it's not consistently reproducible."

### Explanation of Test Cases:

20. **Issue 20**: Tests how the bot handles empty issues. It should not flag as a duplicate and might prompt a request for more information.
21. **Issue 21**: Checks the bot's performance with unusually long issue descriptions. It's useful to see if the bot can handle large amounts of text and still find duplicates or similarities.
22. **Issue 22**: A context-specific issue that should be matched with similar database-related issues but not marked as a duplicate unless the details align closely.
23. **Issue 23**: An exact duplicate of Issue 15, testing if the bot can consistently identify identical issues even when reported multiple times.
24. **Issue 24**: A specific problem that should be matched with other localization issues but should not be marked as a duplicate unless other French localization issues have been reported.
25. **Issue 25**: A direct duplicate of Issue 9, testing the bot's ability to catch copy-paste error reports.
26. **Issue 26**: A security-related issue that should be flagged for immediate attention. The bot should recognize the context and treat it as a high-priority item.
27. **Issue 27**: Represents an intermittent issue that is difficult to reproduce. The bot should note the intermittent nature and possibly flag it for further human investigation.




28. **Issue 28 - Edge Case: Non-Ascii Characters**:
    - Title: "Ошибка при загрузке страницы"
    - Body: "При попытке загрузить страницу возникает ошибка кодировки."

29. **Issue 29 - Edge Case: Code Block with Errors**:
    - Title: "Unhandled Exception in Login Function"
    - Body: "```\nfunction login() {\n throw new Error('Unhandled exception!');\n}\n```"

30. **Issue 30 - Edge Case: Multiple Reports in One**:
    - Title: "Several Issues Found After Update"
    - Body: "1. The login page is not loading correctly.\n2. User profile images are broken.\n3. Search functionality returns no results."

31. **Issue 31 - Context-Specific: Environment-Dependent Issue**:
    - Title: "Application Fails to Start on macOS Big Sur"
    - Body: "The application works on Windows and Linux but fails to start on macOS Big Sur with the following error: ..."

32. **Issue 32 - Data-Heavy: Performance Metrics Report**:
    - Title: "Application Performance Metrics for Q4"
    - Body: "Here are the detailed performance metrics for our application in Q4: [extensive data and graphs]"

33. **Issue 33 - Edge Case: Security Report with Sensitive Data**:
    - Title: "Confidential: Security Vulnerability Discovered"
    - Body: "A critical security vulnerability was identified in the authentication service. Details have been encrypted and attached."

34. **Issue 34 - Edge Case: Feature Request with Business Implications**:
    - Title: "Need for GDPR Compliance Features"
    - Body: "Our application needs to implement GDPR compliance features to adhere to new regulations by Q2."

35. **Issue 35 - Data-Heavy: Detailed Feature Proposal**:
    - Title: "Proposal for Advanced Search Feature"
    - Body: "This is a detailed proposal for an advanced search feature with the following specifications: [detailed technical document]"

### Explanation of Test Cases:

28. **Issue 28**: Tests the bot's ability to handle issues reported in non-ASCII characters, such as Cyrillic script.
29. **Issue 29**: Includes a code block with a specific error, testing the bot's capability to parse and compare code snippets.
30. **Issue 30**: Simulates an issue containing multiple reports, challenging the bot to either link to multiple similar issues or handle it as a unique case.
31. **Issue 31**: A context-specific issue that depends on the operating system, testing the bot's ability to factor in environmental details.
32. **Issue 32**: Contains extensive performance data, testing the bot's ability to handle large volumes of data within an issue.
33. **Issue 33**: A security-related issue that includes sensitive data, testing the bot's ability to recognize and appropriately flag confidential reports.
34. **Issue 34**: A feature request with significant business implications, testing the bot's ability to prioritize and categorize based on content.
35. **Issue 35**: Features a detailed technical proposal, providing a test case for the bot's handling of in-depth, data-heavy feature requests.



36. **Issue 36 - Code-Heavy Bug Report**:
    - Title: "NullReferenceException in Payment Processing"
    - Body: "Encountered a `NullReferenceException` when processing payments. Here's the stack trace and relevant code snippet:\n```\nStackTrace:\n...\n\nRelevant Code:\npublic void ProcessPayment(PaymentDetails details) {\n  if (details == null) {\n    throw new NullReferenceException();\n  }\n  // Process payment logic\n}\n```"

37. **Issue 37 - Large Code Block with Syntax Error**:
    - Title: "Syntax Error in New Feature Branch"
    - Body: "I'm getting a syntax error when trying to run the latest code from the feature branch. The error occurs in the following large block of code:\n```\n// Several hundred lines of code\n```"

38. **Issue 38 - Duplicate Code Issue Across Different Files**:
    - Title: "Repeated Error Handling Logic"
    - Body: "We have the same error handling logic repeated in multiple files. Here's an example from two different files:\nFile1.js:\n```\n// Code snippet\n```\nFile2.js:\n```\n// Identical code snippet\n```"

39. **Issue 39 - Performance Issue with Code and Profiling Data**:
    - Title: "Performance Issue in Rendering Engine"
    - Body: "The rendering engine is taking 30% longer to load scenes than in the previous version. Here's the profiling data and the code for the rendering loop:\n```\n// Profiling data\n// Code snippet\n```"

40. **Issue 40 - Edge Case: Code in Multiple Languages**:
    - Title: "Cross-Language Integration Bug"
    - Body: "There's an issue when integrating Python and JavaScript code. Here are snippets from both:\nPython code:\n```\n# Python snippet\n```\nJavaScript code:\n```\n// JavaScript snippet\n```"

41. **Issue 41 - Complex Issue with Code, Logs, and Images**:
    - Title: "Complex UI Bug with Various Artifacts"
    - Body: "There's a bug in the UI where elements overlap incorrectly under certain conditions. I've attached the code that generates the UI, log files, and screenshots demonstrating the issue.\n```\n// UI generation code\n```\nLogs:\n```\n// Log output\n```\n![Screenshot](image_url)"

42. **Issue 42 - Code Refactoring Request with Examples**:
    - Title: "Refactor Database Access Layer"
    - Body: "The current database access layer is not efficient. Here are some examples of how we access the database and ideas for refactoring:\n```\n// Current database access code\n// Proposed refactoring\n```"

43. **Issue 43 - Security Issue with Code and Explanation**:
    - Title: "Security Hole in Authentication Flow"
    - Body: "I found a security hole in our authentication flow. Here's the problematic code and an explanation of the vulnerability:\n```\n// Authentication code\n```\nExplanation:\n```\n// Explanation of the vulnerability\n```"

### Explanation of Test Cases:

36. **Issue 36**: A detailed bug report with a stack trace and a specific code snippet that the bot needs to handle.
37. **Issue 37**: Tests the bot's ability to process large blocks of code and identify relevant errors or similarities.
38. **Issue 38**: Challenges the bot to recognize duplicate code across multiple files, which could indicate the need for a code refactor.
39. **Issue 39**: Provides performance profiling data along with code, testing the bot's ability to handle numeric data and code together.
40. **Issue 40**: A cross-language issue with code snippets in two different programming languages, Python and JavaScript.
41. **Issue 41**: Includes multiple types of data: code, logs, and images. This tests the bot's ability to parse and relate different types of content.
42. **Issue 42**: A request for code refactoring with current and proposed code examples, challenging the bot to understand code improvement suggestions.
43. **Issue 43**: A security issue report that includes both code and a textual explanation, testing the bot's ability to process and prioritize security-related information.
