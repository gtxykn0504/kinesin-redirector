<?php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: X-API-Key, Content-Type');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

function isHttps() {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
        return true;
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on') {
        return true;
    }
    return false;
}

if (!isHttps()) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'HTTPS required']);
    exit;
}

define('API_KEY', 'your-secret-key-here'); 

$storageFile = __DIR__ . '/rules.json';

$apiKey = isset($_SERVER['HTTP_X_API_KEY']) ? $_SERVER['HTTP_X_API_KEY'] : '';
if ($apiKey !== API_KEY) {
    error_log("Invalid API key attempt from {$_SERVER['REMOTE_ADDR']}");
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid API key']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        if (file_exists($storageFile)) {
            $content = file_get_contents($storageFile);
            $data = json_decode($content, true);
            if (!is_array($data)) {
                $data = ['rules' => [], 'groups' => []];
            }
            if (!isset($data['rules'])) {
                $data['rules'] = [];
            }
            if (!isset($data['groups'])) {
                $data['groups'] = [];
            }
        } else {
            $data = ['rules' => [], 'groups' => []];
        }
        header('Content-Type: application/json');
        echo json_encode($data);
        break;

    case 'POST':
        $input = file_get_contents('php://input');
        $payload = json_decode($input, true);
        
        if (!is_array($payload)) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Invalid JSON data']);
            exit;
        }

        if (!isset($payload['rules']) || !is_array($payload['rules'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Missing or invalid rules array']);
            exit;
        }

        if (!isset($payload['groups']) || !is_array($payload['groups'])) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Missing or invalid groups array']);
            exit;
        }

        foreach ($payload['rules'] as $rule) {
            if (!isset($rule['id'], $rule['from'], $rule['to'], $rule['enabled'])) {
                http_response_code(400);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Malformed rule object', 'expected' => 'id, from, to, enabled']);
                exit;
            }
        }

        foreach ($payload['groups'] as $group) {
            if (!isset($group['id'], $group['name'])) {
                http_response_code(400);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Malformed group object', 'expected' => 'id, name']);
                exit;
            }
            if (isset($group['autoRules']) && !is_array($group['autoRules'])) {
                http_response_code(400);
                header('Content-Type: application/json');
                echo json_encode(['error' => 'autoRules must be an array']);
                exit;
            }
        }

        $fp = fopen($storageFile, 'c');
        if (flock($fp, LOCK_EX)) {
            ftruncate($fp, 0);
            fwrite($fp, json_encode($payload, JSON_PRETTY_PRINT));
            fflush($fp);
            flock($fp, LOCK_UN);
        } else {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Unable to lock file']);
            exit;
        }
        fclose($fp);

        header('Content-Type: application/json');
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(405);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Method not allowed']);
        break;
}